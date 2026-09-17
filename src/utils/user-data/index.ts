/**
 * 用户数据存储边界；业务不可直接依赖具体浏览器数据库。
 *
 * @remarks 存储按 IndexedDB → localStorage → memory 降级；memory 级别刷新后会丢失。
 * 草稿和列偏好必须经此层读写，便于未来迁移到后端同步。
 */
export type UserDataId = string | number;
export type UserDataKind = "preferences" | "draft";
export type UserDataLevel = "indexeddb" | "localStorage" | "memory";
export interface UserDataScope {
  userId: UserDataId;
  tenantId?: UserDataId;
}
export interface UserDataKeyOptions extends UserDataScope {
  /** 数据类别，决定隔离目录与业务语义。 */
  kind: UserDataKind;
  /** 可读、稳定的模块身份，例如 `base.customer`。 */
  moduleKey: string;
  /** 同一模块内的用途，例如 `columns:v1` 或 `add:default`。 */
  slot: string;
  /** 编辑实体的稳定 ID；新增草稿不传。 */
  entityId?: UserDataId;
}
export interface UserDataRecord<T> {
  value: T;
  revision: string;
  schemaVersion: number;
  updatedAt: number;
  expiresAt: number;
}
export interface UserDataResult<T> {
  record: UserDataRecord<T> | null;
  level: UserDataLevel;
}
export interface UserDataWriteOptions {
  /** 调用方维护的数据结构版本；不兼容版本不可直接恢复。 */
  schemaVersion: number;
  /** null 表示只能新建；undefined 表示不检查，用于可替换的偏好缓存。 */
  expectedRevision?: string | null;
  ttlMs?: number;
}
/** 后端实现自行负责鉴权和原子版本检查；本项目不虚构业务端点。 */
export interface UserDataRemoteAdapter {
  read<T>(key: string): Promise<UserDataRecord<T> | null>;
  write<T>(key: string, value: T, options: UserDataWriteOptions): Promise<UserDataRecord<T>>;
  remove(key: string, expectedRevision?: string): Promise<void>;
}
export class UserDataConflictError extends Error {
  constructor() {
    super("数据已被另一个页面更新，请重新读取后处理");
    this.name = "UserDataConflictError";
  }
}
export class UserDataCapacityError extends Error {
  constructor() {
    super("本机用户数据达到容量限制，请清理旧草稿后重试");
    this.name = "UserDataCapacityError";
  }
}

const PREFIX = "user-data/v1/";
function encodeId(id: UserDataId | undefined) {
  if (id === undefined) return "none";
  if (typeof id === "number" && !Number.isSafeInteger(id)) {
    throw new TypeError("用户数据 ID 必须是安全整数或字符串");
  }
  return `${typeof id}:${encodeURIComponent(String(id))}`;
}
function scopePrefix(scope: UserDataScope) {
  return `${PREFIX}${encodeId(scope.tenantId)}/${encodeId(scope.userId)}/`;
}
/**
 * 构造可读且分租户/用户/模块隔离的用户数据 key。
 *
 * @throws moduleKey、slot 为空或类别非法时抛出。
 * @example `createUserDataKey({ kind: "draft", userId: "u-1", moduleKey: "base.customer", slot: "add:default" })`
 */
export function createUserDataKey(options: UserDataKeyOptions): string {
  if (options.kind !== "draft" && options.kind !== "preferences")
    throw new TypeError("未知用户数据类别");
  if (!options.moduleKey.trim() || !options.slot.trim())
    throw new TypeError("模块 Key 和用途不能为空");
  const moduleKey = options.moduleKey.split("/").map(encodeURIComponent).join("/");
  return `${scopePrefix(options)}${options.kind}/${moduleKey}/${encodeURIComponent(options.slot)}/${encodeId(options.entityId)}`;
}

interface StoredRow {
  key: string;
  json: string;
  expiresAt: number;
}
export interface UserDataStoreOptions {
  databaseName?: string;
  /** 默认单条 512 KiB；过大数据拒绝写入，不复制到备用存储。 */
  maxRecordBytes?: number;
  maxRecords?: number;
  memoryMaxBytes?: number;
  indexedDB?: IDBFactory | null;
  localStorage?: Storage | null;
  now?: () => number;
}

/**
 * 创建用户数据存储实例。
 *
 * @param options 容量、浏览器存储实现和时钟的可选注入，主要用于测试或受限运行环境。
 * @returns 支持 read/write/remove、远端适配和降级状态的存储实例。
 * @remarks 默认实例是 userDataStore；业务通常不需要自行创建新实例。
 */
export function createUserDataStore(options: UserDataStoreOptions = {}) {
  const now = options.now ?? Date.now;
  const maxRecordBytes = options.maxRecordBytes ?? 512 * 1024;
  const maxRecords = options.maxRecords ?? 100;
  const memoryMaxBytes = options.memoryMaxBytes ?? 2 * 1024 * 1024;
  const memory = new Map<string, StoredRow>();
  let database: Promise<IDBDatabase> | undefined;
  let idbFailed = false;
  let localFailed = false;
  let remote: UserDataRemoteAdapter | undefined;
  let sessionEpoch = 0;
  let queue: Promise<unknown> = Promise.resolve();
  function serialized<T>(run: () => Promise<T>): Promise<T> {
    const task = queue.then(run, run);
    queue = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }
  function decode<T>(row?: StoredRow | null): UserDataRecord<T> | null {
    if (!row || row.expiresAt <= now()) return null;
    return JSON.parse(row.json) as UserDataRecord<T>;
  }
  function checkRevision(record: UserDataRecord<unknown> | null, expected?: string | null) {
    if (expected !== undefined && (record?.revision ?? null) !== expected) {
      throw new UserDataConflictError();
    }
  }
  function open(): Promise<IDBDatabase> {
    if (database) return database;
    database = new Promise((resolve, reject) => {
      const factory = options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB;
      if (!factory) return reject(new Error("IndexedDB 不可用"));
      const request = factory.open(options.databaseName ?? "medical-cloud-user-data", 1);
      const timeout = setTimeout(() => reject(new Error("数据库打开超时")), 1500);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("records", { keyPath: "key" });
      };
      request.onerror = () => {
        clearTimeout(timeout);
        reject(request.error);
      };
      request.onblocked = () => {
        clearTimeout(timeout);
        reject(new Error("数据库升级被阻止"));
      };
      request.onsuccess = () => {
        clearTimeout(timeout);
        if (idbFailed) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => {
          request.result.close();
          database = undefined;
        };
        resolve(request.result);
      };
    });
    return database;
  }
  function local(): Storage {
    const storage =
      options.localStorage === undefined ? globalThis.localStorage : options.localStorage;
    if (!storage) throw new Error("localStorage 不可用");
    return storage;
  }
  async function idbOperation<T>(key: string, row?: StoredRow | null, expected?: string | null) {
    const db = await open();
    return new Promise<UserDataRecord<T> | null>((resolve, reject) => {
      const tx = db.transaction("records", row === undefined ? "readonly" : "readwrite");
      const store = tx.objectStore("records");
      let result: UserDataRecord<T> | null = null;
      let failure: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error("存储事务中止"));
      tx.onerror = () => {
        /* onabort 统一处理 */
      };
      const request = store.get(key);
      request.onsuccess = () => {
        try {
          result = decode<T>(request.result as StoredRow | undefined);
          if (row === undefined) return;
          checkRevision(result, expected);
          if (row === null) {
            store.delete(key);
            result = null;
            return;
          }
          // 同一写事务内清理过期记录、检查容量、CAS 后写入。
          let count = 0;
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const current = cursor.result;
            if (current) {
              const existing = current.value as StoredRow;
              if (existing.expiresAt <= now()) current.delete();
              else if (existing.key !== key) count++;
              current.continue();
            } else if (count >= maxRecords) {
              failure = new UserDataCapacityError();
              tx.abort();
            } else {
              store.put(row);
              result = decode<T>(row);
            }
          };
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
    });
  }
  async function operation<T>(
    key: string,
    row?: StoredRow | null,
    expected?: string | null
  ): Promise<UserDataResult<T>> {
    if (!key.startsWith(PREFIX)) throw new TypeError("用户数据 Key 必须由公共生成器创建");
    if (!idbFailed) {
      try {
        return { record: await idbOperation<T>(key, row, expected), level: "indexeddb" };
      } catch (error) {
        if (error instanceof UserDataConflictError || error instanceof UserDataCapacityError)
          throw error;
        idbFailed = true;
        database?.then((db) => db.close()).catch(() => undefined);
      }
    }
    // 无 Web Locks 时 localStorage 不能原子 CAS，草稿始终禁止落到该层。
    if (key.split("/")[4] === "preferences" && !localFailed && expected === undefined) {
      try {
        const storage = local();
        const old = storage.getItem(key);
        const record = old ? decode<T>(JSON.parse(old) as StoredRow) : null;
        if (row === undefined) return { record, level: "localStorage" };
        if (row === null) storage.removeItem(key);
        else {
          let count = 0;
          for (let i = storage.length - 1; i >= 0; i--) {
            const storedKey = storage.key(i);
            if (!storedKey?.startsWith(PREFIX)) continue;
            const existing = JSON.parse(storage.getItem(storedKey) ?? "null") as StoredRow | null;
            if (!existing || existing.expiresAt <= now()) storage.removeItem(storedKey);
            else if (storedKey !== key) count++;
          }
          if (count >= maxRecords) throw new UserDataCapacityError();
          storage.setItem(key, JSON.stringify(row));
        }
        return { record: decode<T>(row), level: "localStorage" };
      } catch (error) {
        if (error instanceof UserDataCapacityError) throw error;
        localFailed = true;
      }
    }
    const previous = decode<T>(memory.get(key));
    if (row !== undefined) {
      checkRevision(previous, expected);
      if (row === null) memory.delete(key);
      else {
        let bytes = row.json.length * 2;
        for (const [storedKey, existing] of memory) {
          if (existing.expiresAt <= now()) memory.delete(storedKey);
          else if (storedKey !== key) bytes += existing.json.length * 2;
        }
        if (
          bytes > memoryMaxBytes ||
          (!memory.has(key) && memory.size >= Math.min(maxRecords, 32))
        ) {
          throw new UserDataCapacityError();
        }
        memory.set(key, row);
      }
    }
    return { record: row === undefined ? previous : decode<T>(row), level: "memory" };
  }
  return {
    read<T>(key: string) {
      return serialized(() => operation<T>(key));
    },
    write<T>(key: string, value: T, writeOptions: UserDataWriteOptions) {
      const epoch = sessionEpoch;
      return serialized(async () => {
        if (epoch !== sessionEpoch) throw new Error("账号清理后已取消旧数据写入");
        const timestamp = now();
        const ttl = writeOptions.ttlMs ?? (key.split("/")[4] === "draft" ? 7 : 30) * 86400000;
        const record: UserDataRecord<T> = {
          value,
          schemaVersion: writeOptions.schemaVersion,
          revision: globalThis.crypto.randomUUID(),
          updatedAt: timestamp,
          expiresAt: timestamp + Math.max(1, ttl),
        };
        const json = JSON.stringify(record);
        if (json.length * 2 > maxRecordBytes) throw new UserDataCapacityError();
        return operation<T>(
          key,
          { key, json, expiresAt: record.expiresAt },
          writeOptions.expectedRevision
        );
      });
    },
    remove(key: string, expectedRevision?: string | null) {
      return serialized(async () => {
        await operation(key, null, expectedRevision);
      });
    },
    clearUser(scope: UserDataScope & { kind?: UserDataKind }) {
      sessionEpoch++;
      return serialized(async () => {
        const matches = (key: string) => {
          if (!key.startsWith(PREFIX)) return false;
          const parts = key.split("/");
          return (
            parts[3] === encodeId(scope.userId) &&
            (scope.tenantId === undefined || parts[2] === encodeId(scope.tenantId)) &&
            (!scope.kind || parts[4] === scope.kind)
          );
        };
        let complete = true;
        for (const key of memory.keys()) if (matches(key)) memory.delete(key);
        try {
          const storage = local();
          for (let i = storage.length - 1; i >= 0; i--) {
            const key = storage.key(i);
            if (key && matches(key)) storage.removeItem(key);
          }
        } catch {
          if (!localFailed) complete = false;
        }
        // 即便本次操作已降级，也尝试清理之前持久化的账号数据。
        try {
          const db = await open();
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction("records", "readwrite");
            const request = tx.objectStore("records").openCursor();
            request.onsuccess = () => {
              const cursor = request.result;
              if (!cursor) return;
              if (matches(String(cursor.key))) cursor.delete();
              cursor.continue();
            };
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
          });
        } catch {
          complete = false;
        }
        return { complete };
      });
    },
    setRemoteAdapter(adapter: UserDataRemoteAdapter | undefined) {
      remote = adapter;
    },
    getRemoteAdapter() {
      return remote;
    },
  };
}

export const userDataStore = createUserDataStore();

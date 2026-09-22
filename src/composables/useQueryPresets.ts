import { computed, onScopeDispose, ref, shallowRef } from "vue";
import { createUserDataKey, userDataStore } from "@/utils/user-data/index";
import { parseQueryPreset } from "@/components/business/search/query-presets";
import type {
  QueryPresetController,
  QueryPresetOptions,
  QueryPresetSnapshot,
} from "@/components/business/search/query-presets";
import type { QuerySchema } from "@/components/business/search/types";
import type { CrudColumnIdentity } from "./useCrudColumns";

interface StoredPreset {
  id: string;
  name: string;
  version: number;
  snapshot: unknown;
}
interface PresetCollection {
  items: StoredPreset[];
  defaultId: string | null;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function collection(value: unknown): PresetCollection {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 20)
    throw new Error("查询方案数据损坏，请联系管理员检查本机数据");
  const items: StoredPreset[] = value.items.map((item: unknown) => {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !item.id ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 40 ||
      typeof item.version !== "number"
    )
      throw new Error("查询方案数据结构不正确");
    return { id: item.id, name: item.name, version: item.version, snapshot: item.snapshot };
  });
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    new Set(items.map((item) => item.name)).size !== items.length
  )
    throw new Error("查询方案标识或名称重复");
  if (
    value.defaultId !== null &&
    (typeof value.defaultId !== "string" || !items.some((item) => item.id === value.defaultId))
  )
    throw new Error("默认查询方案不存在");
  return { items, defaultId: value.defaultId };
}

/**
 * 使用公共用户数据存储管理本机查询方案；身份变化时由列表显式 initialize。
 * @param options 当前版本、schema、身份及查询快照读写端口；apply 应原子替换筛选与排序。
 * @returns UI 端口及列表生命周期端口；不提供服务器同步，不持久化固定范围。
 * @example
 * `const presets = useQueryPresets({ ...options, identity: () => page.preference.value });`
 */
export function useQueryPresets<Row, S extends QuerySchema>(options: {
  /** 查询方案语义版本；不兼容升级时递增。 */
  config: QueryPresetOptions;
  /** 当前查询字段白名单，读取旧数据时重新校验。 */
  schema: S;
  /** 当前允许排序的字段，不能包含操作列。 */
  sortKeys: readonly Extract<keyof Row, string>[];
  /** 当前账号、模块及组织/权限范围；列表在身份变化后调用 initialize。 */
  identity: () => CrudColumnIdentity;
  /** 返回已应用条件与排序的独立快照，不读取尚未应用的草稿。 */
  snapshot: () => QueryPresetSnapshot<Row, S>;
  /** 原子应用快照并查询；返回是否成功，不能拆成筛选/排序两次请求。 */
  apply: (snapshot: QueryPresetSnapshot<Row, S>) => Promise<boolean>;
}) {
  const data = shallowRef<PresetCollection>({ items: [], defaultId: null });
  const busy = ref(false),
    error = ref(""),
    notice = ref("");
  const activeId = ref<string | null>(null);
  let alive = true,
    epoch = 0,
    loadedKey = "",
    revision: string | null = null;
  const key = computed(() => {
    const identity = options.identity();
    return createUserDataKey({
      userId: identity.user,
      moduleKey: identity.module,
      kind: "preferences",
      slot: `query-presets:${identity.scope ?? "default"}`,
    });
  });
  const parse = (item: StoredPreset) => {
    if (item.version !== options.config.version) throw new Error("查询配置已升级，请重新保存方案");
    return parseQueryPreset<Row, S>(item.snapshot, options.schema, options.sortKeys);
  };
  const items = computed(() =>
    data.value.items.map((item) => {
      let issue = "";
      try {
        parse(item);
      } catch (cause) {
        issue = message(cause);
      }
      return { id: item.id, name: item.name, issue };
    })
  );
  function message(cause: unknown) {
    return cause instanceof Error ? cause.message : "查询方案操作失败";
  }
  function storageNotice(level: string) {
    notice.value =
      level === "memory"
        ? "仅保存在当前内存中，刷新或关闭后可能丢失"
        : "查询方案保存在本机，不会同步到其他设备";
  }
  async function reload() {
    const run = ++epoch,
      ownKey = key.value;
    busy.value = true;
    error.value = "";
    loadedKey = "";
    data.value = { items: [], defaultId: null };
    revision = null;
    try {
      const result = await userDataStore.read<unknown>(ownKey);
      if (!alive || run !== epoch || key.value !== ownKey) return;
      if (result.record && result.record.schemaVersion !== 1)
        throw new Error("不支持的查询方案存储版本");
      data.value = result.record ? collection(result.record.value) : { items: [], defaultId: null };
      revision = result.record?.revision ?? null;
      loadedKey = ownKey;
      storageNotice(result.level);
    } catch (cause) {
      if (alive && run === epoch && key.value === ownKey) error.value = message(cause);
    } finally {
      if (alive && run === epoch) busy.value = false;
    }
  }
  function nameOf(name: string, except?: string) {
    const value = name.trim();
    if (!value || value.length > 40) throw new Error("方案名称请填写 1–40 个字");
    if (data.value.items.some((item) => item.id !== except && item.name === value))
      throw new Error("已存在同名查询方案");
    return value;
  }
  async function write(update: () => PresetCollection) {
    if (busy.value || !alive) return false;
    const ownKey = key.value,
      run = epoch;
    busy.value = true;
    error.value = "";
    try {
      if (loadedKey !== ownKey) throw new Error("查询方案尚未读取，请重试读取后操作");
      const next = update();
      const result = await userDataStore.write(ownKey, next, {
        schemaVersion: 1,
        expectedRevision: revision,
        ttlMs: 365 * 86400000,
      });
      if (!alive || run !== epoch || key.value !== ownKey) return false;
      data.value = next;
      revision = result.record?.revision ?? null;
      storageNotice(result.level);
      if (activeId.value && !next.items.some((item) => item.id === activeId.value))
        activeId.value = null;
      return true;
    } catch (cause) {
      if (alive && run === epoch && key.value === ownKey)
        error.value = `${message(cause)}；可重试读取后再操作`;
      return false;
    } finally {
      if (alive && run === epoch) busy.value = false;
    }
  }
  function find(id: string) {
    const item = data.value.items.find((item) => item.id === id);
    if (!item) throw new Error("查询方案已不存在，请重试读取");
    return item;
  }
  async function apply(id: string) {
    if (busy.value || !alive) return false;
    const ownKey = key.value,
      run = epoch;
    busy.value = true;
    error.value = "";
    try {
      if (loadedKey !== ownKey) throw new Error("查询方案尚未读取");
      const success = await options.apply(parse(find(id)));
      if (!alive || run !== epoch || key.value !== ownKey) return false;
      if (success) activeId.value = id;
      return success;
    } catch (cause) {
      if (alive && run === epoch && key.value === ownKey) error.value = message(cause);
      return false;
    } finally {
      if (alive && run === epoch) busy.value = false;
    }
  }
  const controller: QueryPresetController = {
    get items() {
      return items.value;
    },
    get defaultId() {
      return data.value.defaultId;
    },
    get activeId() {
      return activeId.value;
    },
    get busy() {
      return busy.value;
    },
    get error() {
      return error.value;
    },
    get notice() {
      return notice.value;
    },
    save: (name) =>
      write(() => {
        if (data.value.items.length >= 20)
          throw new Error("最多保存 20 个查询方案，请先删除不用的方案");
        return {
          ...data.value,
          items: [
            ...data.value.items,
            {
              id: crypto.randomUUID(),
              name: nameOf(name),
              version: options.config.version,
              snapshot: parseQueryPreset<Row, S>(
                options.snapshot(),
                options.schema,
                options.sortKeys
              ),
            },
          ],
        };
      }),
    rename: (id, name) =>
      write(() => {
        find(id);
        const nextName = nameOf(name, id);
        return {
          ...data.value,
          items: data.value.items.map((item) =>
            item.id === id ? { ...item, name: nextName } : item
          ),
        };
      }),
    remove: (id) =>
      write(() => {
        find(id);
        return {
          items: data.value.items.filter((item) => item.id !== id),
          defaultId: data.value.defaultId === id ? null : data.value.defaultId,
        };
      }),
    setDefault: (id) =>
      write(() => {
        if (id !== null) parse(find(id));
        return { ...data.value, defaultId: id };
      }),
    apply,
    reload: async () => {
      if (!busy.value) await reload();
    },
  };
  onScopeDispose(() => {
    alive = false;
    epoch++;
  });
  return {
    controller,
    clearActive: () => {
      activeId.value = null;
    },
    /** 返回 true 表示已处理默认方案（包括失效时阻止自动无条件查询）。 */
    async initialize() {
      activeId.value = null;
      const loading = reload(),
        run = epoch;
      await loading;
      if (!alive || run !== epoch || loadedKey !== key.value) return true;
      if (data.value.defaultId) {
        await apply(data.value.defaultId);
        return true;
      }
      return false;
    },
  };
}

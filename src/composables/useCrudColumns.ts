import { computed, onActivated, onScopeDispose, ref, shallowRef, watch } from "vue";
import { Storage } from "@/utils/storage";
import { APP_PREFIX } from "@/config/constants";
import type { TableColumn } from "@/components/table/types";
import { createUserDataKey, userDataStore, type UserDataRecord } from "@/utils/user-data/index";
import {
  getPreferenceRemoteAdapter,
  getPreferenceSessionRevision,
  markPreferenceChecked,
  shouldCheckPreference,
} from "@/utils/user-data/preferences";

/** 列偏好存储身份；module/version 应稳定、可读且可排障。 */
export interface CrudColumnIdentity {
  user: string;
  module: string;
  version: string;
  scope?: string;
}

export type CrudColumnFixed = "left" | "none" | "right";
export type CrudColumnDensity = "compact" | "comfortable";
export type CrudColumnAlign = "left" | "center" | "right";
export interface CrudColumnPreference {
  key: string;
  visible: boolean;
  width?: number;
  fixed: CrudColumnFixed;
  align: CrudColumnAlign;
  /** 仅分组叶子列存在；同组成员在归一化时保持一致。 */
  groupAlign?: CrudColumnAlign;
}

/**
 * 管理列表列顺序、可见性、宽度、冻结和密度偏好。
 *
 * @typeParam Row 列表行类型。
 * @param columns 模块声明的默认列；它是恢复/白名单的唯一来源。
 * @param identity 返回当前用户、模块、版本和可选范围。
 * @remarks 只持久化列外观；运行时白名单忽略已删除字段与非法宽度。先读远端再复用本地，
 * 后端适配器未配置时安全降级到本机存储。
 * @example `const preferences = useCrudColumns(config.columns, () => ({ user: userId, module: "base.customer", version: "v1" }));`
 */
export function useCrudColumns<Row>(
  columns: readonly TableColumn<Row>[],
  identity: () => CrudColumnIdentity
) {
  const headerGroupKey = (key: string) =>
    columns.find((column) => column.key === key)?.headerGroup?.key;
  const sourceOrder = new Map(columns.map((column, index) => [column.key as string, index]));
  /** 分组表头是配置结构：偏好只能移动整组，不能把叶子列拆到不同位置或固定区。 */
  const arrange = (value: readonly CrudColumnPreference[]) => {
    const fixedOrder = (["left", "none", "right"] as const).flatMap((fixed) =>
      value.filter((item) => item.fixed === fixed)
    );
    const units: CrudColumnPreference[][] = [];
    const collectedGroups = new Set<string>();
    for (const item of fixedOrder) {
      const groupKey = headerGroupKey(item.key);
      if (!groupKey) {
        units.push([item]);
        continue;
      }
      if (collectedGroups.has(groupKey)) continue;
      collectedGroups.add(groupKey);
      const orderedMembers = fixedOrder
        .filter((candidate) => headerGroupKey(candidate.key) === groupKey)
        .sort(
          (left, right) =>
            (sourceOrder.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
            (sourceOrder.get(right.key) ?? Number.MAX_SAFE_INTEGER)
        );
      const anchor = orderedMembers[0] ?? item;
      const members = orderedMembers.map((member) => ({
        ...member,
        fixed: anchor.fixed,
        groupAlign:
          anchor.groupAlign ??
          columns.find((column) => column.key === anchor.key)?.headerGroup?.align ??
          "center",
      }));
      units.push(members);
    }
    return (["left", "none", "right"] as const).flatMap((fixed) =>
      units.filter((unit) => unit[0]?.fixed === fixed).flat()
    );
  };
  const defaults = (): CrudColumnPreference[] =>
    arrange(
      columns.map((column) => ({
        key: column.key,
        visible: true,
        width: column.width,
        fixed: column.headerGroup?.fixed ?? column.fixed ?? "none",
        align: column.align ?? "left",
        groupAlign: column.headerGroup ? (column.headerGroup.align ?? "center") : undefined,
      }))
    );
  const items = shallowRef(defaults());
  const density = ref<CrudColumnDensity>("compact");
  const storageKey = computed(() =>
    createUserDataKey({
      kind: "preferences",
      userId: identity().user,
      tenantId: identity().scope,
      moduleKey: identity().module,
      slot: `columns:${identity().version}`,
    })
  );
  const status = ref("");
  const retryable = ref(false);
  const syncing = ref(false);
  let alive = true;
  let initialized = false;
  let generation = 0;
  let editRevision = 0;
  let remoteRevision: string | null | undefined;
  let pending = false;
  let syncFlight: Promise<void> | undefined;
  let localWrites: Promise<unknown> = Promise.resolve();
  const snapshot = () => ({ columns: items.value, density: density.value });
  const localSnapshot = () => ({ ...snapshot(), sync: { pending, remoteRevision } });
  function queueLocalWrite(key: string, value: ReturnType<typeof localSnapshot>, epoch: number) {
    const session = getPreferenceSessionRevision();
    const task = localWrites
      .catch(() => undefined)
      .then(async () => {
        if (session !== getPreferenceSessionRevision()) return;
        const result = await userDataStore.write(key, value, { schemaVersion: 1 });
        if (alive && epoch === generation && session === getPreferenceSessionRevision()) {
          reportLocal(result.level);
        }
      });
    localWrites = task;
    return task;
  }
  function reportLocal(level: string) {
    if (!getPreferenceRemoteAdapter()) {
      status.value = level === "memory" ? "列设置仅本次会话有效，刷新后可能丢失" : "";
      retryable.value = false;
    }
  }
  function restore() {
    items.value = defaults();
    density.value = "compact";
    persist();
  }
  function persist() {
    editRevision++;
    pending = true;
    const key = storageKey.value,
      epoch = generation,
      value = localSnapshot();
    // 写入只发生于确定/拖拽完成，不监听业务 rows，也不深拷贝页面数据。
    void queueLocalWrite(key, value, epoch).catch(() => {
      if (alive && epoch === generation) {
        status.value = "列设置暂未保存到本机，请重试";
        retryable.value = true;
      }
    });
    void synchronize(true);
  }
  function hydrate(saved: unknown) {
    if (!saved || typeof saved !== "object") return;
    const list: unknown = Reflect.get(saved, "columns");
    if (!Array.isArray(list)) return;
    const allowed = new Map(columns.map((column) => [column.key as string, column]));
    const parsed: CrudColumnPreference[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const name: unknown = Reflect.get(item, "key"),
        width: unknown = Reflect.get(item, "width"),
        savedFixed: unknown = Reflect.get(item, "fixed"),
        savedAlign: unknown = Reflect.get(item, "align"),
        savedGroupAlign: unknown = Reflect.get(item, "groupAlign");
      if (
        typeof name !== "string" ||
        !allowed.has(name) ||
        parsed.some((entry) => entry.key === name)
      )
        continue;
      parsed.push({
        key: name,
        visible: Reflect.get(item, "visible") !== false,
        width:
          typeof width === "number" && Number.isFinite(width) && width >= 64 && width <= 1000
            ? width
            : allowed.get(name)?.width,
        fixed:
          savedFixed === "left" || savedFixed === "right" || savedFixed === "none"
            ? savedFixed
            : (allowed.get(name)?.fixed ?? "none"),
        align:
          savedAlign === "left" || savedAlign === "center" || savedAlign === "right"
            ? savedAlign
            : (allowed.get(name)?.align ?? "left"),
        groupAlign: allowed.get(name)?.headerGroup
          ? savedGroupAlign === "left" ||
            savedGroupAlign === "center" ||
            savedGroupAlign === "right"
            ? savedGroupAlign
            : (allowed.get(name)?.headerGroup?.align ?? "center")
          : undefined,
      });
    }
    items.value = arrange([
      ...parsed,
      ...defaults().filter((item) => !parsed.some((entry) => entry.key === item.key)),
    ]);
    if (!items.value.some((item) => item.visible)) items.value = defaults();
    density.value = Reflect.get(saved, "density") === "comfortable" ? "comfortable" : "compact";
  }
  async function synchronize(force = false): Promise<void> {
    const adapter = getPreferenceRemoteAdapter();
    if (!adapter || !alive) return;
    if (syncFlight) return syncFlight;
    const key = storageKey.value,
      epoch = generation,
      session = getPreferenceSessionRevision();
    if (!force && !pending && !shouldCheckPreference(key)) return;
    syncing.value = true;
    const current = () =>
      alive &&
      epoch === generation &&
      session === getPreferenceSessionRevision() &&
      adapter === getPreferenceRemoteAdapter();
    const run = async () => {
      try {
        // 未读取过远端版本时先读；编辑期间到达的读响应只能建立版本，不能替换 UI。
        if (remoteRevision === undefined || !pending) {
          const editAtRead = editRevision;
          const record = await adapter.read<unknown>(key);
          if (!current()) return;
          remoteRevision = record?.revision ?? null;
          if (!pending && editAtRead === editRevision && record) {
            hydrate(record.value);
          }
        }
        do {
          while (pending && current()) {
            const editAtWrite = editRevision;
            const record: UserDataRecord<ReturnType<typeof snapshot>> = await adapter.write(
              key,
              snapshot(),
              {
                schemaVersion: 1,
                expectedRevision: remoteRevision ?? null,
              }
            );
            if (!current()) return;
            remoteRevision = record.revision;
            pending = editRevision !== editAtWrite;
          }
          if (!current()) return;
          await queueLocalWrite(key, localSnapshot(), epoch);
          if (!current()) return;
        } while (pending);
        markPreferenceChecked(key);
        status.value = "";
        retryable.value = false;
      } catch {
        if (!current()) return;
        status.value = "列设置仅本机生效，尚未同步；远端冲突时请重新进入后核对";
        retryable.value = true;
      } finally {
        if (current()) syncing.value = false;
      }
    };
    const flight = run();
    syncFlight = flight;
    await flight;
    if (syncFlight === flight) syncFlight = undefined;
  }
  watch(
    storageKey,
    (key) => {
      generation++;
      initialized = false;
      editRevision = 0;
      pending = false;
      remoteRevision = undefined;
      syncFlight = undefined;
      syncing.value = false;
      status.value = "";
      retryable.value = false;
      items.value = defaults();
      density.value = "compact";
      // 同步读取旧格式供无闪烁迁移；新存储加载受编辑版本保护。
      let legacy: unknown;
      try {
        const { user, module, version } = identity();
        legacy = Storage.get(
          `${APP_PREFIX}:crud-columns:${JSON.stringify({ user, module, version })}`
        );
        hydrate(legacy);
      } catch {
        /* 浏览器禁用 localStorage 时继续统一存储降级。 */
      }
      const epoch = generation;
      void localWrites
        .then(async () => {
          const result = await userDataStore.read<unknown>(key);
          if (!alive || epoch !== generation || editRevision !== 0) return;
          if (result.record) {
            hydrate(result.record.value);
            const value = result.record.value;
            const sync =
              value && typeof value === "object" ? Reflect.get(value, "sync") : undefined;
            if (sync && typeof sync === "object") {
              pending = Reflect.get(sync, "pending") === true;
              const revision: unknown = Reflect.get(sync, "remoteRevision");
              remoteRevision =
                typeof revision === "string" || revision === null ? revision : undefined;
            }
          } else if (legacy) await userDataStore.write(key, snapshot(), { schemaVersion: 1 });
          if (!alive || epoch !== generation) return;
          initialized = true;
          reportLocal(result.level);
          await synchronize(!result.record && !legacy);
        })
        .catch(() => {
          if (alive && epoch === generation) status.value = "列设置读取失败，当前使用默认值";
        });
    },
    { immediate: true }
  );
  onActivated(() => {
    if (initialized) void synchronize();
  });
  onScopeDispose(() => {
    alive = false;
    generation++;
  });
  function update(
    key: string,
    patch: { visible?: boolean; width?: number; align?: CrudColumnAlign }
  ) {
    if (
      patch.width !== undefined &&
      (!Number.isFinite(patch.width) || patch.width < 64 || patch.width > 1000)
    )
      return;
    if (patch.align !== undefined && !["left", "center", "right"].includes(patch.align)) return;
    const next = items.value.map((item) => (item.key === key ? { ...item, ...patch } : item));
    if (!next.some((item) => item.visible)) return;
    items.value = arrange(next);
    persist();
  }
  function apply(nextItems: readonly CrudColumnPreference[], nextDensity: CrudColumnDensity) {
    const allowed = new Map(columns.map((column) => [column.key as string, column]));
    const next: CrudColumnPreference[] = [];
    for (const item of nextItems) {
      const source = allowed.get(item.key);
      if (!source || next.some((entry) => entry.key === item.key)) continue;
      next.push({
        key: item.key,
        visible: item.visible !== false,
        width:
          item.width === undefined ||
          (Number.isFinite(item.width) && item.width >= 64 && item.width <= 1000)
            ? item.width
            : source.width,
        fixed: ["left", "none", "right"].includes(item.fixed)
          ? item.fixed
          : (source.fixed ?? "none"),
        align: ["left", "center", "right"].includes(item.align)
          ? item.align
          : (source.align ?? "left"),
        groupAlign: source.headerGroup
          ? item.groupAlign && ["left", "center", "right"].includes(item.groupAlign)
            ? item.groupAlign
            : (source.headerGroup.align ?? "center")
          : undefined,
      });
    }
    next.push(...defaults().filter((item) => !next.some((entry) => entry.key === item.key)));
    if (!next.some((item) => item.visible)) return false;
    items.value = arrange(next);
    density.value = nextDensity === "comfortable" ? "comfortable" : "compact";
    persist();
    return true;
  }
  function move(key: string, delta: -1 | 1) {
    const next = [...items.value],
      index = next.findIndex((item) => item.key === key),
      destination = index + delta;
    if (index < 0 || destination < 0 || destination >= next.length) return;
    if (next[index]?.fixed !== next[destination]?.fixed) return;
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    items.value = arrange(next);
    persist();
  }
  const visibleColumns = computed(() =>
    items.value.flatMap((item) => {
      const column = columns.find((entry) => entry.key === item.key);
      return item.visible && column
        ? [
            {
              ...column,
              width: item.width,
              fixed: item.fixed === "none" ? undefined : item.fixed,
              align: item.align,
              headerGroup: column.headerGroup
                ? {
                    ...column.headerGroup,
                    fixed: item.fixed === "none" ? undefined : item.fixed,
                    align: item.groupAlign ?? column.headerGroup.align ?? "center",
                  }
                : undefined,
            },
          ]
        : [];
    })
  );
  return {
    items,
    density,
    columns: visibleColumns,
    update,
    apply,
    move,
    restore,
    defaults,
    status,
    retryable,
    syncing,
    retry: () => {
      persist();
    },
    setDensity(value: CrudColumnDensity) {
      density.value = value;
      persist();
    },
  };
}

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
  /** 当前用户的稳定标识，不同用户列偏好分开保存。 */
  user: string;
  /** 稳定模块 key，用于区分不同业务列表。 */
  module: string;
  /** 列偏好结构版本，例如 v1；不兼容升级时更换以启用新默认值。 */
  version: string;
  /** 可选组织或权限范围，省略时不增加范围隔离。 */
  scope?: string;
}

export type CrudColumnFixed = "left" | "none" | "right";
export type CrudColumnDensity = "compact" | "comfortable";
export type CrudColumnAlign = "left" | "center" | "right";
export interface CrudColumnPreference {
  /** 对应 TableColumn.key，只允许保存当前模块声明的列。 */
  key: string;
  /** 该列是否显示；应用设置后必须至少保留一列可见。 */
  visible: boolean;
  /** 列宽，单位像素；允许 64–1000，省略时沿用列配置的宽度。 */
  width?: number;
  /** 固定区域：left 左侧、right 右侧、none 不固定；同一分组保持一致。 */
  fixed: CrudColumnFixed;
  /** 单元格对齐方式：left、center 或 right，默认取模块配置或 left。 */
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
 * @remarks 只持久化列外观；运行时白名单忽略已删除字段与非法宽度。先恢复本机设置再尝试远端同步，
 * 后端适配器未配置时安全降级到本机存储。
 * @example
 * `const preferences = useCrudColumns(config.columns, () => ({ user: userId, module: "base.customer", version: "v1" }));`
 */
export function useCrudColumns<Row>(
  columns: readonly TableColumn<Row>[],
  identity: () => CrudColumnIdentity
) {
  /** 读取字段所属的分组表头 key，无分组返回 undefined。 */
  const headerGroupKey = (key: string) =>
    columns.find((column) => column.key === key)?.headerGroup?.key;
  /** 模块声明的原始列顺序，用于保持同组字段的排列关系。 */
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
  /** 根据当前列配置生成全新默认偏好，并把同组字段放在一起。 */
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
  /** 用户当前选择的列顺序和显示设置，不包含业务行数据。 */
  const items = shallowRef(defaults());
  /** 表格行密度，默认 compact；与列设置一起保存。 */
  const density = ref<CrudColumnDensity>("compact");
  /** 按用户、组织范围、模块和偏好版本隔离列设置。 */
  const storageKey = computed(() =>
    createUserDataKey({
      kind: "preferences",
      userId: identity().user,
      tenantId: identity().scope,
      moduleKey: identity().module,
      slot: `columns:${identity().version}`,
    })
  );
  /** 列设置读取、保存或同步异常的提示；正常持久保存时为空。 */
  const status = ref("");
  /** 当前是否有可以重试的本机保存或远端同步问题。 */
  const retryable = ref(false);
  /** 远端同步是否进行中，供设置界面显示状态。 */
  const syncing = ref(false);
  /** 当前页面实例是否仍存在，卸载后不再更新 UI。 */
  let alive = true;
  /** 当前身份的本机设置是否已读完，激活页签后才允许常规同步。 */
  let initialized = false;
  /** 存储身份变化次数，用于丢弃上个用户或组织的异步结果。 */
  let generation = 0;
  /** 本机列设置修改次数；异步读取不能覆盖读取期间产生的用户调整。 */
  let editRevision = 0;
  /** 远端版本；undefined 表示未读取，null 表示远端还没有记录。 */
  let remoteRevision: string | null | undefined;
  /** 存在尚未同步到远端的本机调整，随本机快照保存以便下次继续。 */
  let pending = false;
  /** 正在执行的远端同步任务，重复调用复用它，避免并发写同一版本。 */
  let syncFlight: Promise<void> | undefined;
  /** 本机写入队列，保证后一次设置不会被先发后到的旧写入覆盖。 */
  let localWrites: Promise<unknown> = Promise.resolve();
  /** 只提取列设置和密度，作为远端偏好内容。 */
  const snapshot = () => ({ columns: items.value, density: density.value });
  /** 本机额外记录待同步标记和远端版本，重开页面后可接着同步。 */
  const localSnapshot = () => ({ ...snapshot(), sync: { pending, remoteRevision } });
  /** 按顺序写入给定身份的本机快照；账号会话变化后跳过旧任务。 */
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
  /** 未配置远端服务时，提示仅内存存储的限制。 */
  function reportLocal(level: string) {
    if (!getPreferenceRemoteAdapter()) {
      status.value = level === "memory" ? "列设置仅本次会话有效，刷新后可能丢失" : "";
      retryable.value = false;
    }
  }
  /** 恢复模块默认列和紧凑密度，并保存这次选择。 */
  function restore() {
    items.value = defaults();
    density.value = "compact";
    persist();
  }
  /** 记录用户修改，排队保存到本机并尝试远端同步；失败保留当前设置。 */
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
  /** 按当前列白名单解析存储数据，丢弃非法值、补齐新列并保证至少显示一列。 */
  function hydrate(saved: unknown) {
    if (!saved || typeof saved !== "object") return;
    const list: unknown = Reflect.get(saved, "columns");
    if (!Array.isArray(list)) return;
    const allowed = new Map(columns.map((column) => [column.key as string, column]));
    const parsed: CrudColumnPreference[] = [];
    // 存储内容按不可信旧数据处理：仅接受现有列，过滤重复项，并逐项校验外观值。
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
    // 旧设置里没有的新列补上默认值，随后恢复分组关系，避免升级后字段永远不显示。
    items.value = arrange([
      ...parsed,
      ...defaults().filter((item) => !parsed.some((entry) => entry.key === item.key)),
    ]);
    if (!items.value.some((item) => item.visible)) items.value = defaults();
    density.value = Reflect.get(saved, "density") === "comfortable" ? "comfortable" : "compact";
  }
  /** 读取远端版本并同步待保存调整；编辑期间的旧响应不覆盖 UI，失败允许重试。 */
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
          // 写入等待期间用户可能再次调整；比较编辑次数，直到最新一版也同步完成。
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
          // 把远端新版本与待同步状态再保存到本机，供下次打开继续同步。
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
  /** 用户或模块存储身份变化时恢复默认值，再读取对应设置和迁移旧格式。 */
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
          // 用户已经调整过列时，本机旧设置也不能迟到后覆盖当前界面。
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
  /** 缓存页面重新显示时按同步检查间隔更新偏好，不重复读取本机。 */
  onActivated(() => {
    if (initialized) void synchronize();
  });
  /** 销毁实例后使未完成同步失效，防止继续更新当前界面。 */
  onScopeDispose(() => {
    alive = false;
    generation++;
  });
  /** 更新单列的可见性、宽度或对齐；非法值和隐藏最后一列的操作被忽略。 */
  function update(
    key: string,
    patch: {
      /** 本次是否调整显示状态；省略则保留当前状态，不能隐藏最后一列。 */
      visible?: boolean;
      /** 本次指定的列宽，单位像素，允许 64–1000；省略不调整。 */
      width?: number;
      /** 本次指定 left、center 或 right；省略不调整当前对齐。 */
      align?: CrudColumnAlign;
    }
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
  /** 接收设置面板确认的整份偏好，清理无效字段后应用并保存；全隐藏返回 false。 */
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
  /** 将字段前后移动一位；不能越界或跨固定区，分组关系随后重新整理。 */
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
  /** 将用户偏好合入模块列配置，生成实际传给表格的可见列。 */
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

import { onBeforeUnmount, reactive } from "vue";
import { cloneModel } from "@/components/business/fields/model";
import { createUserDataKey, userDataStore, UserDataConflictError } from "@/utils/user-data/index";

/** 表单草稿持久化配置；由模块 form 配置持有。 */
export interface CrudDraftConfig<Model, Entity> {
  version: number;
  /** 显式允许落盘的主表字段；子表由各自配置提供快照。 */
  fields: readonly Extract<keyof Model, string>[];
  getEntityVersion?: (entity: Entity) => string | number;
  ttlMs?: number;
}
export interface CrudDraftIdentity {
  userId: string | number;
  tenantId?: string | number;
  /** 同一路由多个新增实例需显式区分；默认由宿主传 fullPath。 */
  instanceKey?: string;
}
export interface CrudDraftState {
  enabled: boolean;
  phase: "idle" | "checking" | "available" | "saving" | "saved" | "error" | "conflict" | "unsafe";
  message: string;
  updatedAt: number | null;
  memoryOnly: boolean;
}
/**
 * 草稿状态与受控动作。
 *
 * @remarks restore 只在 state.phase 为 available 时有效；unsafe 草稿不能恢复或提交。
 * memoryOnly 为 true 时刷新页面可能丢失草稿。
 */
export interface CrudDraftController {
  readonly state: Readonly<CrudDraftState>;
  restore(): Promise<boolean>;
  discard(): Promise<boolean>;
  flush(): Promise<boolean>;
  retry(): Promise<boolean>;
  inspect(): string;
}
interface DraftPayload {
  model: Record<string, unknown>;
  children: Record<string, unknown>;
  entityVersion: string | number | null;
  outcome: "editing" | "pending" | "committed";
}
interface DraftHost<Model, Entity> {
  identity(): CrudDraftIdentity | undefined;
  moduleKey: string;
  target(): { mode: "add" } | { mode: "edit"; id: string | number };
  model(): Model;
  entity(): Entity | null;
  canEdit(): boolean;
  isDirty(): boolean;
  children(): Iterable<
    [string, { snapshotDraft?: () => unknown; restoreDraft?: (data: unknown) => Promise<boolean> }]
  >;
  patch(value: Partial<Model>): void;
}

/**
 * 为当前 CRUD 表单创建本机草稿协调器。
 *
 * @param config 未配置时返回禁用状态控制器。
 * @param host 表单模型、子表端口和实体版本的受控访问器。
 * @remarks 只在 changed 通知后防抖读取一次白名单快照，不 deep-watch 或缓存历史整单。
 * 存储会按 IndexedDB、localStorage、memory 降级，并使用 revision 防止多窗口静默覆盖。
 */
export function useCrudDraft<Model extends object, Entity>(
  config: CrudDraftConfig<Model, Entity> | undefined,
  host: DraftHost<Model, Entity>
) {
  const state = reactive<CrudDraftState>({
    enabled: !!config,
    phase: "idle",
    message: "",
    updatedAt: null,
    memoryOnly: false,
  });
  let key: ReturnType<typeof createUserDataKey> | undefined;
  let revision: string | null = null;
  let candidate: DraftPayload | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let alive = true;
  let generation = 0;
  let changes = 0;
  let suspended = true;
  let submitLocked = false;
  let restoring = false;
  let flight: Promise<boolean> | undefined;
  const cancelTimer = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const version = () => {
    const entity = host.entity();
    return entity && config?.getEntityVersion ? config.getEntityVersion(entity) : null;
  };
  const pending = () =>
    !!candidate ||
    state.phase === "checking" ||
    state.phase === "unsafe" ||
    state.phase === "conflict";
  const fail = (cause: unknown) => {
    state.phase = "error";
    state.message = cause instanceof Error ? cause.message : "本机草稿保存失败，请重试";
  };
  function reset() {
    generation++;
    suspended = true;
    submitLocked = false;
    cancelTimer();
    key = undefined;
    revision = null;
    candidate = undefined;
    state.phase = "idle";
    state.message = "";
    state.updatedAt = null;
  }
  async function open() {
    reset();
    if (!config) return;
    const identity = host.identity();
    if (!identity || !host.moduleKey) {
      fail(new Error("未配置草稿用户身份或模块 key"));
      return;
    }
    const target = host.target();
    const run = generation;
    try {
      key = createUserDataKey({
        kind: "draft",
        userId: identity.userId,
        tenantId: identity.tenantId,
        moduleKey: host.moduleKey,
        slot: target.mode === "add" ? `add:${identity.instanceKey ?? "default"}` : "edit",
        entityId: target.mode === "edit" ? target.id : undefined,
      });
      state.phase = "checking";
      const result = await userDataStore.read<DraftPayload>(key);
      if (!alive || run !== generation) return;
      state.memoryOnly = result.level === "memory";
      revision = result.record?.revision ?? null;
      if (result.record) {
        candidate = result.record.value;
        state.updatedAt = result.record.updatedAt;
        if (
          !candidate ||
          typeof candidate !== "object" ||
          !candidate.model ||
          !candidate.children
        ) {
          state.phase = "conflict";
          state.message = "本机草稿格式无效，请丢弃后继续";
        } else if (candidate.outcome !== "editing") {
          state.phase = "unsafe";
          state.message = "这份草稿曾发起提交，结果需核实；为防止重复写入，不能恢复或再次提交";
        } else if (
          result.record.schemaVersion !== config.version ||
          (target.mode === "edit" && (version() === null || candidate.entityVersion !== version()))
        ) {
          state.phase = "conflict";
          state.message = "草稿结构或服务端版本已变化，不能直接覆盖当前记录";
        } else {
          state.phase = "available";
          state.message = "发现本机未提交草稿，是否恢复？";
        }
      } else {
        suspended = false;
        state.phase = "idle";
      }
    } catch (cause) {
      if (alive && run === generation) fail(cause);
    }
  }
  function changed() {
    changes++;
    if (!config || suspended || submitLocked || restoring || !key || pending() || !host.canEdit())
      return;
    cancelTimer();
    state.phase = "idle";
    state.message = "正在编辑，稍后保存本机草稿";
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, 1000);
  }
  async function write(outcome: DraftPayload["outcome"] = "editing"): Promise<boolean> {
    if (!config || !key || suspended || pending()) return false;
    const run = generation;
    const currentKey = key;
    const change = changes;
    try {
      const model: Record<string, unknown> = {};
      for (const field of config.fields) model[field] = cloneModel(host.model()[field]);
      const children: Record<string, unknown> = {};
      for (const [childKey, child] of host.children())
        if (child.snapshotDraft) children[childKey] = child.snapshotDraft();
      state.phase = "saving";
      const result = await userDataStore.write(
        currentKey,
        { model, children, entityVersion: version(), outcome } satisfies DraftPayload,
        {
          schemaVersion: config.version,
          expectedRevision: revision,
          ttlMs: config.ttlMs ?? 7 * 86400000,
        }
      );
      if (!alive || run !== generation) return false;
      if (!result.record) throw new Error("本机草稿写入没有返回记录");
      revision = result.record.revision;
      state.updatedAt = result.record.updatedAt;
      state.memoryOnly = result.level === "memory";
      state.phase = "saved";
      state.message = state.memoryOnly
        ? "草稿仅保留在内存，刷新或关闭浏览器后可能丢失"
        : "草稿已保存到本机，尚未提交服务器";
      if (change !== changes && outcome === "editing" && !submitLocked) changed();
      return true;
    } catch (cause) {
      if (alive && run === generation) {
        // CAS 冲突必须重新读取，不能静默覆盖另一窗口。
        fail(cause);
        if (cause instanceof UserDataConflictError) {
          state.phase = "conflict";
          suspended = true;
          state.message = "另一窗口已更新草稿，请重新进入后选择恢复，当前输入未被覆盖";
        }
      }
      return false;
    }
  }
  function flush(): Promise<boolean> {
    cancelTimer();
    if (!config) return Promise.resolve(true);
    if (flight) return flight.then(() => flush());
    if (suspended || pending() || submitLocked || !host.canEdit()) return Promise.resolve(false);
    if (!host.isDirty()) return Promise.resolve(true);
    flight = write().finally(() => {
      flight = undefined;
    });
    return flight;
  }
  async function mark(outcome: "pending" | "committed") {
    if (!config) return true;
    submitLocked = true;
    cancelTimer();
    if (flight) await flight;
    cancelTimer();
    return write(outcome);
  }
  async function discard() {
    if (!config || !key || state.phase === "unsafe") return false;
    suspended = true;
    cancelTimer();
    if (flight) await flight;
    const run = generation;
    try {
      await userDataStore.remove(key, revision);
      if (!alive || run !== generation) return false;
      revision = null;
      candidate = undefined;
      suspended = false;
      state.phase = "idle";
      state.message = "本机草稿已删除";
      state.updatedAt = null;
      return true;
    } catch (cause) {
      if (alive && run === generation) fail(cause);
      return false;
    }
  }
  async function restore() {
    if (!config || !candidate || restoring || state.phase !== "available" || !host.canEdit())
      return false;
    restoring = true;
    state.phase = "saving";
    const data = candidate;
    const run = generation;
    const patch: Partial<Model> = {};
    const previous: Partial<Model> = {};
    for (const field of config.fields)
      if (Object.hasOwn(data.model, field))
        patch[field] = cloneModel(data.model[field]) as Model[typeof field];
    for (const field of config.fields) previous[field] = cloneModel(host.model()[field]);
    const childPorts = [...host.children()];
    const backups = childPorts.map(
      ([childKey, child]) => [childKey, child.snapshotDraft?.()] as const
    );
    try {
      if (
        Object.keys(data.children).some((key) => !childPorts.some(([childKey]) => childKey === key))
      )
        throw new Error("部分草稿子表尚未登记或已移除，不能恢复");
      host.patch(patch);
      for (const [childKey, child] of childPorts) {
        if (
          Object.hasOwn(data.children, childKey) &&
          (!child.restoreDraft || !(await child.restoreDraft(data.children[childKey])))
        )
          throw new Error(`子表 ${childKey} 草稿结构不兼容，未完成恢复`);
        if (!alive || run !== generation) return false;
      }
      candidate = undefined;
      suspended = false;
      state.phase = "saved";
      state.message = "已恢复本机草稿，请检查后手动提交";
      return true;
    } catch (cause) {
      if (alive && run === generation) {
        host.patch(previous);
        for (const [childKey, child] of childPorts) {
          const backup = backups.find(([key]) => key === childKey)?.[1];
          if (backup !== undefined) {
            try {
              await child.restoreDraft?.(backup);
            } catch {
              /* 保留候选，提示重新加载，不自动提交。 */
            }
          }
        }
        if (alive && run === generation) {
          state.phase = "conflict";
          state.message = `${cause instanceof Error ? cause.message : "草稿恢复失败"}；已尝试撤回，请重新加载后检查`;
        }
      }
      return false;
    } finally {
      restoring = false;
    }
  }
  onBeforeUnmount(() => {
    cancelTimer();
    alive = false;
    generation++;
    candidate = undefined;
  });
  return {
    state,
    open,
    reset,
    changed,
    flush,
    mark,
    discard,
    restore,
    inspect: () => (candidate ? JSON.stringify(candidate, null, 2) : "暂无待恢复草稿"),
    async retry() {
      if (suspended && !candidate) {
        await open();
        return state.phase !== "error";
      }
      return flush();
    },
    get pending() {
      return pending();
    },
    async rejectSubmission() {
      if (config) {
        suspended = false;
        submitLocked = false;
        await markEditing();
      }
    },
  };
  async function markEditing() {
    if (flight) await flight;
    await write();
  }
}

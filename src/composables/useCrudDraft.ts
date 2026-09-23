import { onBeforeUnmount, reactive } from "vue";
import { cloneModel } from "@/components/business/fields/model";
import { createUserDataKey, userDataStore, UserDataConflictError } from "@/utils/user-data/index";

/** 表单草稿持久化配置；由模块 form 配置持有。 */
export interface CrudDraftConfig<Model, Entity> {
  /** 草稿结构版本，不兼容地调整字段或模型时递增；旧版本会提示冲突。 */
  version: number;
  /** 显式允许落盘的主表字段；子表由各自配置提供快照。 */
  fields: readonly Extract<keyof Model, string>[];
  /** 返回接口记录的稳定版本，用于检查草稿是否基于当前记录；编辑草稿缺少版本时不允许恢复。 */
  getEntityVersion?: (entity: Entity) => string | number;
  /** 草稿有效期，单位毫秒；省略时为 7 天。 */
  ttlMs?: number;
}
export interface CrudDraftIdentity {
  /** 当前账号 ID，必须提供；不同账号的本机草稿分开保存。 */
  userId: string | number;
  /** 当前租户或组织 ID；省略时不增加租户隔离。 */
  tenantId?: string | number;
  /** 同一路由多个新增实例需显式区分；默认由调用方传 fullPath。 */
  instanceKey?: string;
}
export interface CrudDraftState {
  /** 是否配置了草稿功能；未配置时为 false。 */
  enabled: boolean;
  /** 草稿处理阶段；available 等待恢复选择，conflict 表示版本冲突，unsafe 表示提交结果需核实。 */
  phase: "idle" | "checking" | "available" | "saving" | "saved" | "error" | "conflict" | "unsafe";
  /** 当前阶段的说明或错误，空字符串时不显示提示文字。 */
  message: string;
  /** 最近一次草稿保存的时间戳，单位毫秒；还没有记录时为 null。 */
  updatedAt: number | null;
  /** 是否已降级为内存保存；为 true 时刷新或关闭页面会丢失草稿。 */
  memoryOnly: boolean;
}
/**
 * 草稿状态与受控动作。
 *
 * @remarks restore 只在 state.phase 为 available 时有效；unsafe 草稿不能恢复或提交。
 * memoryOnly 为 true 时刷新页面可能丢失草稿。
 */
export interface CrudDraftController {
  /** 草稿状态的只读接口，供提示条读取；修改通过恢复、丢弃等方法完成。 */
  readonly state: Readonly<CrudDraftState>;
  /** 恢复可用候选到表单，成功返回 true；结构冲突或任一子表恢复失败返回 false。 */
  restore(): Promise<boolean>;
  /** 按存储版本删除本机草稿，成功返回 true；unsafe 状态不能删除。 */
  discard(): Promise<boolean>;
  /** 等待已有写入并立即保存最新修改；无修改或未启用返回 true，不能保存返回 false。 */
  flush(): Promise<boolean>;
  /** 读取失败时重新打开草稿，其余情况尝试立即保存；返回是否完成。 */
  retry(): Promise<boolean>;
  /** 返回待恢复候选的 JSON 文本，供用户检查；没有候选时返回提示文字。 */
  inspect(): string;
}
interface DraftPayload {
  /** 按白名单保存的主表值，可能仍有业务校验错误，恢复后需要正常校验。 */
  model: Record<string, unknown>;
  /** 按子表模型字段 key 保存的快照，由对应子表检查和恢复。 */
  children: Record<string, unknown>;
  /** 生成草稿时的服务端记录版本；新增或没有版本来源时为 null。 */
  entityVersion: string | number | null;
  /** editing 可继续编辑；pending 已开始提交；committed 已确认接口写入，后两者不能直接恢复重提。 */
  outcome: "editing" | "pending" | "committed";
}
interface DraftHost<Model, Entity> {
  /** 返回当前账号、组织和新增实例身份；缺失时提示草稿配置错误。 */
  identity(): CrudDraftIdentity | undefined;
  /** 稳定业务模块 key，用于生成草稿存储键，不允许空字符串。 */
  moduleKey: string;
  /** 返回当前新增或编辑目标，决定草稿按实例还是记录 ID 保存。 */
  target():
    | {
        /** add 表示新增实例，edit 表示已有记录；编辑目标同时提供 id。 */
        mode: "add";
      }
    | {
        /** add 表示新增实例，edit 表示已有记录；编辑目标同时提供 id。 */
        mode: "edit";
        /** 编辑记录的稳定 ID，数字 0 有效，参与本机存储身份。 */
        id: string | number;
      };
  /** 返回当前主表模型供白名单取值，不在草稿层直接修改它。 */
  model(): Model;
  /** 返回编辑基线用于读取记录版本；新增时返回 null。 */
  entity(): Entity | null;
  /** 当前是否允许恢复和自动保存，调用方合并权限、只读及忙碌限制。 */
  canEdit(): boolean;
  /** 当前是否存在未保存的主表修改或子表草稿，无变化时跳过存储写入。 */
  isDirty(): boolean;
  /** 枚举已登记子表的模型字段名及草稿方法，供保存和恢复逐个调用。 */
  children(): Iterable<
    [
      string,
      {
        /** 返回子表的独立草稿快照；省略表示该子表不保存草稿。 */
        snapshotDraft?: () => unknown;
        /** 检查并恢复给定子表快照，成功返回 true；省略时无法恢复该子表。 */
        restoreDraft?: (data: unknown) => Promise<boolean>;
      },
    ]
  >;
  /** 将允许恢复的主表字段交给表单更新；表单负责过滤当前只读字段。 */
  patch(value: Partial<Model>): void;
}

/**
 * 为当前 CRUD 表单创建本机草稿协调器。
 *
 * @param config 未配置时返回禁用状态控制器。
 * @param host 表单模型、子表操作接口和实体版本的受控访问器。
 * @remarks 只在 changed 通知后防抖读取一次白名单快照，不 deep-watch 或缓存历史整单。
 * 存储会按 IndexedDB、localStorage、memory 降级，并使用 revision 防止多窗口静默覆盖。
 */
export function useCrudDraft<Model extends object, Entity>(
  config: CrudDraftConfig<Model, Entity> | undefined,
  host: DraftHost<Model, Entity>
) {
  /** 草稿提示条使用的状态，包括可恢复、冲突、保存失败及仅内存保存等情况。 */
  const state = reactive<CrudDraftState>({
    enabled: !!config,
    phase: "idle",
    message: "",
    updatedAt: null,
    memoryOnly: false,
  });
  /** 当前用户、模块和记录对应的存储键；尚未打开草稿时未定义。 */
  let key: ReturnType<typeof createUserDataKey> | undefined;
  /** 最近读取或写入的存储版本；写入时携带它，防止覆盖其他窗口的新草稿。 */
  let revision: string | null = null;
  /** 读到但尚未经用户确认恢复的草稿；有候选时暂停自动保存，避免覆盖它。 */
  let candidate: DraftPayload | undefined;
  /** 输入后延迟一秒保存的定时器，后续输入会重新计时。 */
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** 实例是否仍存在，卸载后不再更新草稿提示。 */
  let alive = true;
  /** 每次重新打开或重置草稿递增，用来丢弃上一记录的异步存储结果。 */
  let generation = 0;
  /** 输入变更次数；一次写入期间又有修改时，完成后安排下一次保存。 */
  let changes = 0;
  /** 暂停自动保存；读取候选、版本冲突或重置期间为 true。 */
  let suspended = true;
  /** 已开始提交保护，禁止普通编辑快照覆盖 pending/committed 标记。 */
  let submitLocked = false;
  /** 正在恢复主表和子表，阻止重复恢复及中途自动保存。 */
  let restoring = false;
  /** 正在进行的普通草稿写入；后续 flush、提交标记和删除等待它结束。 */
  let flight: Promise<boolean> | undefined;
  /** 取消尚未执行的自动保存，不会取消已经发出的存储写入。 */
  const cancelTimer = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  /** 读取当前服务端记录版本；新增或未配置版本函数时返回 null。 */
  const version = () => {
    const entity = host.entity();
    return entity && config?.getEntityVersion ? config.getEntityVersion(entity) : null;
  };
  /** 是否还有必须先处理的草稿状态；有候选、检查中、冲突或结果待核实时阻止提交。 */
  const pending = () =>
    !!candidate ||
    state.phase === "checking" ||
    state.phase === "unsafe" ||
    state.phase === "conflict";
  /** 将存储异常写到草稿提示条，保留当前用户输入。 */
  const fail = (cause: unknown) => {
    state.phase = "error";
    state.message = cause instanceof Error ? cause.message : "本机草稿保存失败，请重试";
  };
  /** 清除上一目标的存储身份和候选，并使尚未结束的读取失效。 */
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
  /** 读取当前目标的本机草稿，检查格式、提交标记和版本后提示恢复；不会自动覆盖表单。 */
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
      // 先固定账号、组织及新增实例/编辑 ID，保证不同表单的草稿不会串用。
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
      // 已存在草稿先检查结构和提交结果，再核对模型版本；检查通过也由用户选择是否恢复。
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
  /** 记录一次编辑变化；可编辑且没有待处理草稿时安排延迟保存。 */
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
  /** 保存主表白名单及子表快照，核对存储版本；冲突时暂停写入并提示重新读取。 */
  async function write(outcome: DraftPayload["outcome"] = "editing"): Promise<boolean> {
    if (!config || !key || suspended || pending()) return false;
    const run = generation;
    const currentKey = key;
    const change = changes;
    try {
      // 只复制配置允许保存的字段，子表自行提供快照，避免整份页面数据落盘。
      const model: Record<string, unknown> = {};
      for (const field of config.fields) model[field] = cloneModel(host.model()[field]);
      const children: Record<string, unknown> = {};
      for (const [childKey, child] of host.children())
        if (child.snapshotDraft) children[childKey] = child.snapshotDraft();
      state.phase = "saving";
      // 携带上次存储版本做条件写入；另一窗口先保存了新版本就拒绝覆盖。
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
      // 等待写入期间还有新输入时再安排保存，不能把旧快照完成视为最新输入已保存。
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
  /** 立即保存当前修改；串行等待已有写入，没有修改时直接成功。 */
  function flush(): Promise<boolean> {
    cancelTimer();
    if (!config) return Promise.resolve(true);
    // 普通写入串行排队；等前一笔结束后重新检查是否还有修改和保存权限。
    if (flight) return flight.then(() => flush());
    if (suspended || pending() || submitLocked || !host.canEdit()) return Promise.resolve(false);
    if (!host.isDirty()) return Promise.resolve(true);
    flight = write().finally(() => {
      flight = undefined;
    });
    return flight;
  }
  /** 写入 pending 或 committed 标记，保护已发起提交的草稿不被再次提交。 */
  async function mark(outcome: "pending" | "committed") {
    if (!config) return true;
    submitLocked = true;
    cancelTimer();
    if (flight) await flight;
    cancelTimer();
    return write(outcome);
  }
  /** 等待当前写入完成后按版本删除草稿；结果待核实的 unsafe 草稿不允许删除。 */
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
  /** 恢复候选中的主表和子表；任一子表失败时尝试还原恢复前的输入并提示检查。 */
  async function restore() {
    if (!config || !candidate || restoring || state.phase !== "available" || !host.canEdit())
      return false;
    restoring = true;
    state.phase = "saving";
    const data = candidate;
    const run = generation;
    // 恢复前分别准备允许回填的字段和当前输入备份，后面子表失败时可尝试撤回。
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
      // 确认草稿所需子表全部存在后，先恢复主表，再逐个恢复子表。
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
        // 部分恢复失败时先撤回主表，再尽力恢复子表备份；保留候选并提示重新加载检查。
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
  /** 卸载时取消延迟保存并使旧存储结果失效，不临时发起新的写入。 */
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
  /** 确认提交被拒绝后，将草稿重新标为可编辑；等待之前的普通写入完成。 */
  async function markEditing() {
    if (flight) await flight;
    await write();
  }
}

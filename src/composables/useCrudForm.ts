import type { CrudFormStatus } from "@/components/business/crud/form-state";
import { crudFormActivity } from "@/components/business/crud/form-state";
import { useCrudFormLifecycle } from "./useCrudFormLifecycle";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onActivated,
  onDeactivated,
  readonly,
  shallowRef,
  ref,
  watch,
} from "vue";
import {
  cloneModel,
  cloneReadonlyModel,
  readonlyModel,
  sameModelValue,
} from "@/components/business/fields/model";
import { createRequestChannel } from "@/utils/request-channel";
import { crudPermission } from "./useCrudActions";
import { invalidateView } from "./useViewInvalidation";
import { feedbackConfig } from "@/config/feedback";
import { notifyFeedback, dismissFeedback } from "@/utils/feedback";
import { normalizeFields } from "@/components/business/fields/normalize";
import { useCrudDraft, type CrudDraftIdentity } from "./useCrudDraft";
import type { DeepReadonly } from "vue";
import type { FieldKey } from "@/components/business/fields/types";
import type {
  CrudChildModule,
  CrudFormConfig,
  CrudFormController,
  CrudFormPort,
  CrudIssue,
  CrudNavigation,
  CrudSaveInput,
  CrudTarget,
  CrudValidation,
} from "@/components/business/crud/types";

/**
 * 管理新增或编辑表单的加载、修改、校验、保存和草稿，返回值可直接传给 MyCrudForm。
 *
 * @typeParam Model 页面编辑模型。
 * @typeParam Entity 服务端详情实体。
 * @typeParam Id 实体稳定主键。
 * @param config 模块 form 配置。
 * @param options 上下文、导航、初始目标、列表失效 key 与草稿身份。
 * @returns 可传给 MyCrudForm 的 CrudFormController。
 * @remarks 控制器固定当前 target；不会监听全局路由而在后台 KeepAlive 页面加载其他实体。
 * 草稿仅保存 config.draft.fields 白名单和已登记子表快照。
 * @example
 * `const controller = useCrudForm(config.form, { context: () => pageContext, invalidateViewKey: "base.customer.list" });`
 */
export function useCrudForm<
  Model extends object,
  Entity,
  Id extends string | number,
  CreateDTO,
  UpdateDTO,
  SaveResult,
  C,
>(
  config: CrudFormConfig<Model, Entity, Id, CreateDTO, UpdateDTO, SaveResult, C>,
  options: {
    /** 返回当前组织、权限等业务信息的只读对象；变化时旧加载和校验失效。 */
    context: () => DeepReadonly<C>;
    /** 保存成功或关闭时执行的导航方法；省略时由外部自行处理页面切换。 */
    navigation?: CrudNavigation<Id>;
    /** 本实例首次新增或编辑的目标；省略为新增，编辑需提供稳定 ID。 */
    initialTarget?: CrudTarget<Id>;
    /** 保存成功后标记所属列表；列表恢复时才刷新。 */
    invalidateViewKey?: string;
    /** 返回本机草稿的账号、组织及新增实例身份；启用草稿时需要提供。 */
    draftIdentity?: () => CrudDraftIdentity | undefined;
  }
): CrudFormController<Model, Entity, Id> {
  // shallowRef 保留 Model 的字段关联；对外通过深只读视图暴露。
  const model = shallowRef(config.createInitial(options.context()));
  /** 最近一次从接口读取的完整记录；编辑 DTO 和版本校验以它为准，新增时为 null。 */
  const baseline = shallowRef<Entity | null>(null);
  /** 整份模型被加载或恢复的次数，通知字段组件重新同步输入缓存。 */
  const hydrationRevision = shallowRef(0);
  /** 复制并替换整份表单模型，同时通知字段组件清理上一份输入状态。 */
  function hydrateModel(value: Model) {
    model.value = cloneModel(value);
    hydrationRevision.value++;
  }
  /** 固定本实例首次打开的新增/编辑目标，避免跟随其他标签页的路由变化。 */
  const initialTarget = cloneModel<CrudTarget<Id>>(options.initialTarget ?? { mode: "add" });
  /** 当前正在编辑的目标；新增保存成功后改为带真实 ID 的编辑目标。 */
  const target = shallowRef<CrudTarget<Id>>(initialTarget);
  // 编辑深链首屏直接进入加载态，避免先挂载可编辑控件再于同一周期卸载。
  const status = shallowRef<CrudFormStatus>({
    phase: initialTarget.mode === "edit" || config.beforeOpen ? "loading" : "ready",
    mutationOutcome: "none",
  });
  /** 当前加载、校验、提交或回填阶段，供界面和操作限制使用。 */
  const phase = computed(() => status.value.phase);
  /** 接口写入是否已确认成功；与界面阶段分开记录，避免回填失败后重复提交。 */
  const mutationOutcome = computed(() => status.value.mutationOutcome);
  // 阶段与写入结果原子更新，同步 watcher 不会看到一半转换的状态。
  function transition(next: CrudFormStatus["phase"], outcome = mutationOutcome.value) {
    status.value = { phase: next, mutationOutcome: outcome };
  }
  /** 根据阶段和提交结果计算忙碌、离开限制及保存禁用原因。 */
  const activity = computed(() => crudFormActivity(status.value));
  /** 本轮主表和子表校验问题，供错误列表及定位字段使用。 */
  const issues = shallowRef<readonly CrudIssue<Model>[]>([]);
  /** 当前加载、保存或关闭失败的提示；开始下一次操作时清空。 */
  const error = shallowRef<string | null>(null);
  /** 加载或保存成功后的模型副本，用于判断是否存在未保存修改。 */
  const cleanModel = shallowRef(cloneModel(model.value));
  /** revision 记录模型及子表登记变化；session 区分打开目标，异步结果必须仍属于当前版本。 */
  let revision = 0,
    /** 每次打开或重置目标递增，使上一轮保存结果不能回填当前表单。 */
    session = 0;
  /** alive 表示实例尚未卸载；closing 防止离开确认期间重复关闭或保存。 */
  let alive = true,
    /** 正在等待离开检查，期间禁止再次关闭或保存。 */
    closing = false;
  // 活跃状态属于当前组件实例；后台 KeepAlive 页不弹提示、不抢走前台路由。
  let active = true;
  /** 当前成功提示所属的保存操作；切到后台时用它撤下该提示。 */
  let feedbackOperation: object | undefined;
  /** 缓存页重新显示后，允许保存提示和后续导航。 */
  onActivated(() => {
    active = true;
  });
  /** 切到其他标签时停止前台提示，后台请求仍按自身版本规则处理。 */
  onDeactivated(() => {
    active = false;
    if (feedbackOperation) dismissFeedback(feedbackOperation);
  });
  /** 记录已经通过的离开确认，供紧接着的路由或容器关闭复用，避免连续询问。 */
  let approvedNavigation = false;
  /** 用户选择丢弃草稿后的待办标记；实际关闭时才删除本机草稿。 */
  let discardDraftOnLeave = false;
  /** 每次保存或上下文重置递增，避免旧保存的 finally 解开新操作的锁。 */
  let flightVersion = 0;
  /** saveFlight 覆盖完整保存流程；registryRevision 让普通 Map 的子表增删参与响应式计算。 */
  const saveFlight = ref(false),
    /** 子表 Map 增删时递增，让 dirty 和 childrenReady 重新计算。 */
    registryRevision = ref(0);
  /** 加载与保存共用的请求通道；启动新操作会使前一操作过期。 */
  const channel = createRequestChannel();
  /** 已挂载子表的提交、校验、定位和草稿方法；主表保存时按登记顺序调用。 */
  const children = new Map<
    FieldKey<Model>,
    {
      /** 确认子表正在编辑的行；接收本轮取消信号，返回能否继续整单保存。 */
      commit: (signal: AbortSignal) => Promise<{
        /** 是否允许继续保存；false 时保留行输入并显示 reason。 */
        proceed: boolean;
        /** 不能确认子表输入的原因；省略时显示“请完成明细草稿”。 */
        reason?: string;
      }>;
      /** 校验本轮整单快照中的子表；接收取消信号及模型版本，返回错误清单。 */
      validate: (
        value: Model,
        signal: AbortSignal,
        revision: number
      ) => Promise<CrudValidation<Model>>;
      /** 取消子表尚未确认的行编辑，不向服务端写入。 */
      cancel: () => void;
      /** 设置子表保存期间的只读锁，true 锁定、false 释放。 */
      lock: (value: boolean) => void;
      /** 按错误中的行 ID 和字段聚焦子表控件，供整单错误定位使用。 */
      focus: (issue: CrudIssue<Model>) => Promise<void>;
      /** 是否还有未确认的子表输入；参与表单离开提示和草稿保存判断。 */
      dirty: () => boolean;
      /** 返回子表草稿快照；未提供时不保存该子表草稿。 */
      snapshotDraft?: () => unknown;
      /** 恢复子表快照，成功返回 true；缺失或返回 false 会阻止整份草稿恢复成功。 */
      restoreDraft?: (snapshot: unknown) => Promise<boolean>;
      /** 解除子表草稿变化订阅的函数，解绑或卸载时调用；未订阅时省略。 */
      stopDraft?: () => void;
    }
  >();
  /** 主字段表单登记的校验及聚焦方法；组件卸载后解除引用。 */
  let form: CrudFormPort<Model> | undefined;
  /** 接口成功后保留返回值和提交快照；回填失败可用它重试读取，无需再次写接口。 */
  let receipt:
    | {
        /** 接口已成功返回的保存结果，供 resolveSaved 读取完整记录。 */
        result: SaveResult;
        /** 发起该次成功保存时的只读快照和上下文，回填重试继续使用它。 */
        input: CrudSaveInput<Model, Entity, Id, C>;
      }
    | undefined;
  /** 比较主表当前值与已保存值，并检查子表是否还有未确认的行编辑。 */
  const dirty = computed(() => {
    registryRevision.value;
    return (
      !sameModelValue(model.value, cleanModel.value) ||
      [...children.values()].some((child) => child.dirty())
    );
  });
  /** 配置声明的所有子表是否都已挂载，防止缺少明细时保存或恢复草稿。 */
  const childrenReady = computed(() => {
    registryRevision.value;
    return (config.childKeys ?? []).every((key) => children.has(key));
  });
  /** 向组件提供同一份表单状态；对外读取时再包装成只读对象。 */
  const state = computed(() => ({
    phase: phase.value,
    mutationOutcome: mutationOutcome.value,
    model: model.value,
    hydrationRevision: hydrationRevision.value,
    baseline: baseline.value,
    target: target.value,
    dirty: dirty.value,
    issues: issues.value,
    error: error.value,
  }));
  /** 当前是否处于不能离开的提交关键阶段。 */
  const critical = () => activity.value.critical;
  /** 本表单的本机草稿管理器；只读取配置白名单，并通过 patch 恢复可编辑字段。 */
  const drafts = useCrudDraft(config.draft, {
    identity: () => options.draftIdentity?.(),
    moduleKey: options.invalidateViewKey ?? "",
    target: () => target.value,
    model: () => model.value,
    entity: () => baseline.value,
    isDirty: () => dirty.value,
    canEdit: () =>
      alive &&
      childrenReady.value &&
      !busy() &&
      !activity.value.reconciliationReason &&
      crudPermission(
        target.value.mode === "add" ? config.permissions?.create : config.permissions?.update
      ) &&
      !config.readonlyReason?.(snapshot(model.value), options.context()),
    children: () => children.entries(),
    patch: (value) => {
      // 恢复草稿前按当前模型重新判断只读字段，避免旧草稿覆盖现在不允许编辑的值。
      const readonlyFields = new Set(
        normalizeFields(config.fields, {
          model: model.value,
          context: cloneReadonlyModel<C>(options.context()),
          mode: target.value.mode,
        })
          .filter((entry) => entry.form?.readonly || entry.field.form === false)
          .map((entry) => entry.field.key)
      );
      const next: Partial<Model> = {};
      for (const key of config.draft?.fields ?? [])
        if (!readonlyFields.has(key) && Object.hasOwn(value, key)) next[key] = value[key];
      const previous = model.value;
      patch(next);
      if (model.value !== previous) hydrationRevision.value++;
    },
  });
  /** 当前阶段是否忙碌，供修改模型和草稿自动保存判断使用。 */
  const busy = () => activity.value.busy;
  /** 把传给业务回调的数据变成只读视图，要求修改统一经过 patch。 */
  const snapshot = readonlyModel;
  /** 将未知异常转换成可展示文字，保留 Error 提供的具体原因。 */
  const message = (cause: unknown) => (cause instanceof Error ? cause.message : "操作失败，请重试");
  /** 同步设置所有已登记子表的只读锁，保证整单校验与提交期间明细稳定。 */
  function lock(value: boolean) {
    children.forEach((child) => child.lock(value));
  }
  /** 递增数据版本并取消当前请求，使等待中的校验或加载结果失效。 */
  function invalidate() {
    revision++;
    channel.cancel();
  }
  /** 合并允许的字段修改；有实际变化时递增版本、清理旧校验并安排草稿保存。 */
  function patch(value: Partial<Model>) {
    if (!alive || !activity.value.canPatch) return;
    if (config.readonlyReason?.(snapshot(model.value), options.context())) return;
    const next = { ...model.value, ...cloneModel(value) };
    if (sameModelValue(next, model.value)) return;
    model.value = next;
    revision++;
    issues.value = [];
    drafts.changed();
  }
  /** 按错误的 section 定位主表字段或子表行；不传时定位首个校验问题。 */
  async function focusFirst(
    input: CrudIssue<Model> | DeepReadonly<CrudIssue<Model>> | undefined = issues.value[0]
  ) {
    if (!input || !alive) return;
    const issue = cloneReadonlyModel<CrudIssue<Model>>(input);
    const child = issue.section
      ? [...children].find(([key]) => key === issue.section)?.[1]
      : undefined;
    if (child) await child.focus(issue);
    else await form?.focus(issue);
  }
  /** 依次执行业务关闭检查和未保存提示；返回是否允许离开，并记录草稿保留选择。 */
  async function guardLeave() {
    if (approvedNavigation) return true;
    // saved 后的自动导航仍处于 saveFlight 内；离开守卫按流程阶段判断，不能拦截成功导航。
    if (!activity.value.canLeave || closing) return false;
    closing = true;
    const version = revision;
    try {
      // 先给模块机会阻止离开；通过后才询问如何处理未保存内容。
      const guard = await config.beforeClose?.(
        { dirty: dirty.value, target: cloneModel(target.value) },
        { context: snapshot<C>(options.context()), signal: new AbortController().signal }
      );
      if (guard && !guard.proceed) {
        error.value = guard.reason;
        return false;
      }
      if (dirty.value || activity.value.reconciliationReason) {
        const notice =
          phase.value === "committed-needs-sync"
            ? "数据已提交，但尚未回填。离开不会撤销已提交的数据，确定离开吗？"
            : mutationOutcome.value === "unknown"
              ? "提交结果尚未核实，请核实后再进行写入。确定离开吗？"
              : "当前内容尚未保存，确定离开吗？";
        try {
          await ElMessageBox.confirm(notice, "离开页面", {
            confirmButtonText:
              config.draft && !activity.value.reconciliationReason ? "保留草稿并离开" : "离开",
            cancelButtonText:
              config.draft && !activity.value.reconciliationReason ? "丢弃草稿并离开" : "继续编辑",
            distinguishCancelAndClose: !!config.draft,
            type: "warning",
          });
          // 选择保留草稿时先确保落盘成功，失败则留在当前页，避免关闭后丢失输入。
          if (
            config.draft &&
            !activity.value.reconciliationReason &&
            !drafts.pending &&
            !(await drafts.flush())
          )
            return false;
        } catch (cause) {
          if (cause === "cancel" && config.draft && !activity.value.reconciliationReason)
            discardDraftOnLeave = true;
          else if (cause === "cancel" || cause === "close") return false;
          else throw cause;
        }
      }
      // 确认框等待期间可能又有修改或开始提交，需要重新核对，不能沿用旧许可。
      return alive && version === revision && !critical();
    } catch (cause) {
      error.value = message(cause);
      return false;
    } finally {
      closing = false;
    }
  }
  /** 等待用户处理已有草稿后再执行 afterOpen；请求取消时停止监听并拒绝等待。 */
  function waitForDraftDecision(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      // 这里只等待草稿决策结束；真正恢复或丢弃由草稿控制器执行。
      const stop = watch(
        () => [drafts.state.phase, drafts.pending] as const,
        ([, pending]) => {
          if (!pending) finish();
        },
        { flush: "sync" }
      );
      const abort = () => {
        stop();
        reject(signal.reason);
      };
      /** 草稿待处理状态结束后解除监听和取消事件，完成本次等待。 */
      function finish() {
        stop();
        signal.removeEventListener("abort", abort);
        resolve();
      }
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      else if (!drafts.pending) finish();
    });
  }
  /** 切换到指定新增或编辑目标，清理旧输入后加载数据；过期响应不回填，失败进入加载错误态。 */
  async function open(next: CrudTarget<Id>) {
    if (saveFlight.value) return false;
    if (approvedNavigation) approvedNavigation = false;
    else if (!(await guardLeave())) return false;
    // 通过离开检查后再清空上一目标，同时让旧目标的请求和行编辑失效。
    session++;
    drafts.reset();
    invalidate();
    children.forEach((child) => child.cancel());
    form?.clear();
    receipt = undefined;
    target.value = cloneModel(next);
    baseline.value = null;
    error.value = null;
    issues.value = [];
    const run = channel.start();
    transition("loading", "none");
    try {
      const input = {
        target: cloneModel(next),
        signal: run.signal,
        context: snapshot<C>(options.context()),
      };
      const defaults = config.beforeOpen ? await config.beforeOpen(input) : undefined;
      if (!alive || !run.isCurrent()) return false;
      if (next.mode === "edit" && defaults) throw new Error("编辑初始化不能返回新增默认值");
      hydrateModel({ ...config.createInitial(options.context()), ...defaults });
      // 新增使用初始值；编辑读取完整记录，分别保留接口基线和可编辑模型。
      if (next.mode === "edit") {
        const entity = await config.load(next.id, input);
        if (!alive || !run.isCurrent()) return false;
        baseline.value = cloneModel(entity);
        hydrateModel(config.toModel(cloneModel(entity), options.context()));
      }
      cleanModel.value = cloneModel(model.value);
      transition("ready");
      await drafts.open();
      if (!alive || !run.isCurrent()) return false;
      // 发现本机草稿时，先等用户决定，再让 afterOpen 读取最终的模型。
      if (config.afterOpen) {
        if (drafts.pending) await waitForDraftDecision(run.signal);
        if (!alive || !run.isCurrent()) return false;
        transition("loading");
        await config.afterOpen({
          ...input,
          model: snapshot(model.value),
          baseline: snapshot(baseline.value),
        });
        if (!alive || !run.isCurrent()) return false;
        transition("ready");
      }
      return true;
    } catch (cause) {
      if (alive && run.isCurrent()) {
        error.value = message(cause);
        transition("load-error");
      }
      return false;
    }
  }
  /** 根据成功回执读取完整记录并回填表单，再通知列表及执行保存后导航；失败保留回执。 */
  async function synchronize(
    saved: NonNullable<typeof receipt>,
    run: ReturnType<typeof channel.start>
  ) {
    // 到这里接口已经写入成功；后续失败只允许重试回填，不应重新提交。
    transition("resolving", "committed");
    try {
      await drafts.mark("committed");
      if (!alive || !run.isCurrent()) return;
      const entity = await config.resolveSaved(saved.result, {
        ...saved.input,
        signal: run.signal,
      });
      if (!alive || !run.isCurrent()) return;
      // 完整记录读取成功后，一起更新编辑基线、表单值和目标 ID，清除旧校验与行草稿。
      const value = config.toModel(cloneModel(entity), saved.input.context);
      baseline.value = cloneModel(entity);
      hydrateModel(value);
      cleanModel.value = cloneModel(value);
      target.value = { mode: "edit", id: config.getKey(entity) };
      revision++;
      issues.value = [];
      form?.clear();
      children.forEach((child) => child.cancel());
      transition("saved");
      await drafts.discard();
      await drafts.open();
      receipt = undefined;
      // 模型回填已完成；后处理和跳转失败单独提示，不把保存状态退回写入失败。
      const synchronizedRevision = revision;
      try {
        if (options.invalidateViewKey) invalidateView(options.invalidateViewKey);
        await config.afterSave?.(snapshot(entity), {
          signal: run.signal,
          context: saved.input.context,
        });
        if (!alive || !run.isCurrent() || revision !== synchronizedRevision) return;
        if (!active) return;
        feedbackOperation = saved;
        if (config.feedback?.saved !== false)
          notifyFeedback("success", config.feedback?.saved ?? feedbackConfig.messages.saved, saved);
        await options.navigation?.saved?.(config.getKey(entity));
      } catch (cause) {
        dismissFeedback(saved);
        if (alive && run.isCurrent() && revision === synchronizedRevision)
          error.value = `保存成功，后续处理失败：${message(cause)}`;
      }
    } catch (cause) {
      if (alive && run.isCurrent()) {
        transition("committed-needs-sync");
        error.value = `保存已提交，回填失败：${message(cause)}`;
      }
    }
  }
  /** 确认子表行编辑、校验整单后发送一次保存；写入成功与回填失败分别处理。 */
  async function save() {
    if (!alive || saveFlight.value || closing || activity.value.saveDisabledReason) return;
    if (config.draft && drafts.pending) {
      error.value = "请先处理本机草稿提示；提交结果待核实的草稿不能重复提交";
      return;
    }
    const permission =
      target.value.mode === "add" ? config.permissions?.create : config.permissions?.update;
    if (!crudPermission(permission)) {
      error.value = "无保存权限";
      return;
    }
    const reason = config.readonlyReason?.(snapshot(model.value), options.context());
    if (reason) {
      error.value = reason;
      return;
    }
    const run = channel.start();
    const currentSession = session;
    const flight = ++flightVersion;
    saveFlight.value = true;
    let submitted = false;
    let focusValidationIssue = false;
    transition("committing", "none");
    error.value = null;
    issues.value = [];
    const current = () => alive && run.isCurrent() && session === currentSession;
    try {
      if (config.fields.length && !form) throw new Error("主表单尚未登记，不能保存");
      for (const key of config.childKeys ?? [])
        if (!children.has(key)) throw new Error(`子模块尚未登记：${key}`);
      // 先确认子表正在编辑的行，使其输入进入主模型，再取得整单校验快照。
      for (const [key, child] of children) {
        const result = await child.commit(run.signal);
        if (!current()) return;
        if (!result.proceed) {
          issues.value = [{ section: key, message: result.reason ?? "请完成明细草稿" }];
          transition("ready");
          focusValidationIssue = true;
          return;
        }
      }
      await nextTick();
      if (!current()) return;
      lock(true);
      transition("validating");
      // 锁住子表并固定本轮数据版本，异步校验期间有任何新修改就丢弃本轮结果。
      const version = revision;
      const modelSnapshot = cloneModel(model.value);
      const input: CrudSaveInput<Model, Entity, Id, C> = {
        model: snapshot(modelSnapshot),
        baseline: snapshot(baseline.value),
        target: cloneModel(target.value),
        signal: run.signal,
        context: snapshot<C>(options.context()),
      };
      const valid = () => current() && revision === version;
      // 依次收集主表、子表和模块整单校验，统一生成可定位的错误清单。
      const results: CrudValidation<Model>[] = [];
      if (form) results.push(await form.validate());
      if (!valid()) return;
      for (const child of children.values()) {
        results.push(await child.validate(modelSnapshot, run.signal, version));
        if (!valid()) return;
      }
      if (config.validate) results.push(await config.validate(input));
      if (!valid()) return;
      issues.value = results.flatMap((result) => (result.valid ? [] : [...result.issues]));
      if (!issues.value.length && results.some((result) => !result.valid))
        issues.value = [{ message: "校验未通过或已过期，请重试" }];
      if (issues.value.length) {
        transition("ready");
        focusValidationIssue = true;
        return;
      }
      // 校验全部通过后再执行保存前业务检查；等待结束后还要复查数据版本和权限。
      const guard = await config.beforeSave?.(input);
      if (!valid()) return;
      if (guard && !guard.proceed) {
        error.value = guard.reason;
        transition("ready");
        return;
      }
      if (!crudPermission(permission)) {
        error.value = "保存权限已变化";
        transition("ready");
        return;
      }
      // 按新增/编辑转换对应 DTO，先准备请求函数，保护标记写好后才真正发出。
      let request: () => Promise<SaveResult>;
      if (input.target.mode === "add") {
        const dto = config.toCreate({ ...input, target: input.target, baseline: null });
        request = () => config.create(dto, input);
      } else {
        if (input.baseline === null) throw new Error("缺少编辑基线，请重新加载");
        const id = input.target.id;
        const dto = config.toUpdate({ ...input, target: input.target, baseline: input.baseline });
        request = () => config.update(id, dto, input);
      }
      if (!valid()) return;
      // 先持久记录“即将提交”，防止页面中断后把这份草稿当成从未提交而重复写入。
      if (!(await drafts.mark("pending"))) {
        error.value = "草稿提交保护标记写入失败，请重试后再提交";
        transition("ready");
        return;
      }
      if (!valid()) return;
      transition("saving", "pending");
      submitted = true;
      const result = await request();
      if (!current()) return;
      // 保留接口成功回执，再开始读回完整记录；读回失败仍可使用此回执重试。
      receipt = { result, input };
      await synchronize(receipt, run);
    } catch (cause) {
      if (!current()) return;
      // 无幂等/提交查询协议，写入异常不能猜测服务端回滚。
      transition(
        "save-error",
        submitted ? (config.classifySaveError?.(cause) ?? "unknown") : "rejected"
      );
      if (mutationOutcome.value === "rejected") await drafts.rejectSubmission();
      error.value =
        mutationOutcome.value === "unknown"
          ? `提交结果未知，请核实后重新进入页面：${message(cause)}`
          : message(cause);
    } finally {
      if (flight === flightVersion) saveFlight.value = false;
      if (current()) {
        if (phase.value === "validating" || phase.value === "committing") transition("ready");
        lock(false);
        if (focusValidationIssue) {
          // 先释放整单校验锁并更新子表 readonly，再进入错误行编辑。
          await nextTick();
          if (current()) await focusFirst();
        }
      }
    }
  }
  /** 仅使用上次成功回执重试回填，绝不再次调用 create/update。 */
  async function retrySync() {
    if (!alive || closing || saveFlight.value || !receipt || phase.value !== "committed-needs-sync")
      return;
    const run = channel.start();
    const flight = ++flightVersion;
    saveFlight.value = true;
    error.value = null;
    lock(true);
    try {
      await synchronize(receipt, run);
    } finally {
      if (flight === flightVersion) saveFlight.value = false;
      if (run.isCurrent()) lock(false);
    }
  }
  /** 登记一个子表的公开方法并返回解绑函数；重复字段 key 直接报错。 */
  function registerChild<K extends FieldKey<Model>>(module: CrudChildModule<Model, K>) {
    if (children.has(module.key)) throw new Error(`子模块重复登记：${module.key}`);
    const child = {
      commit: (signal: AbortSignal) => module.commitDraft({ signal }),
      validate: (value: Model, signal: AbortSignal, revision: number) =>
        module.validate(snapshot(value[module.key]), { signal, revision }),
      cancel: module.cancelDraft,
      lock: module.setReadonly,
      focus: module.focus,
      dirty: module.isDirty ?? (() => false),
      snapshotDraft: module.snapshotDraft,
      restoreDraft: module.restoreDraft,
      stopDraft: module.subscribeDraft?.(() => drafts.changed()),
    };
    children.set(module.key, child);
    registryRevision.value++;
    // 持久锁仅用于保存事务；加载态由 binding/controller.busy 动态读取。
    // 初始化期间登记的子表不能在 ready 后仍带着一次性 loading 锁。
    module.setReadonly(saveFlight.value);
    if (childrenReady.value) drafts.changed();
    return () => {
      if (children.get(module.key) === child) {
        child.stopDraft?.();
        children.delete(module.key);
        revision++;
        registryRevision.value++;
      }
    };
  }
  /** 组织或权限上下文变化时取消旧工作并清空旧数据；提交中的结果保留为待核实。 */
  watch(
    options.context,
    () => {
      flightVersion++;
      saveFlight.value = false;
      // 取消前先记录是否已经发出写请求；切换上下文无法证明服务端写入被撤销。
      const outcomeUnknown = phase.value === "saving";
      session++;
      drafts.reset();
      invalidate();
      receipt = undefined;
      children.forEach((child) => child.cancel());
      lock(false);
      form?.clear();
      hydrateModel(config.createInitial(options.context()));
      cleanModel.value = cloneModel(model.value);
      baseline.value = null;
      issues.value = [];
      transition("load-error", outcomeUnknown ? "unknown" : "none");
      error.value = outcomeUnknown
        ? "上下文已变化，原提交结果需核实；请重新加载当前记录"
        : "上下文已变化，请重新加载当前记录";
    },
    { deep: true, flush: "sync" }
  );
  /** 关闭实例时清理草稿选择、请求和子表订阅，阻止异步结果继续回填。 */
  onBeforeUnmount(() => {
    if (discardDraftOnLeave) void drafts.discard();
    alive = false;
    session++;
    invalidate();
    children.forEach((child) => child.cancel());
    children.forEach((child) => child.stopDraft?.());
    children.clear();
  });
  /** 提供给 MyCrudForm 的状态与受控操作；界面通过这些方法修改模型或执行保存。 */
  const controller: CrudFormController<Model, Entity, Id> = {
    draft: config.draft ? drafts : undefined,
    get state() {
      return readonly(state).value;
    },
    get busy() {
      return busy() || saveFlight.value;
    },
    get childrenReady() {
      return childrenReady.value;
    },
    get readonlyReason() {
      return config.readonlyReason?.(snapshot(model.value), options.context());
    },
    get savePermission() {
      return crudPermission(
        target.value.mode === "add" ? config.permissions?.create : config.permissions?.update
      );
    },
    patch,
    focusIssue: focusFirst,
    save,
    retrySync,
    open,
    registerChild,
    async canLeave() {
      const allowed = await guardLeave();
      if (allowed) approvedNavigation = true;
      return allowed;
    },
    cancelLeaveApproval() {
      approvedNavigation = false;
      discardDraftOnLeave = false;
    },
    registerForm(port) {
      if (form) throw new Error("主表单重复登记");
      form = port;
      return () => {
        if (form === port) {
          form = undefined;
          revision++;
        }
      };
    },
    async close() {
      if (saveFlight.value) return false;
      if (!(await guardLeave())) return false;
      approvedNavigation = true;
      try {
        await options.navigation?.close?.();
      } catch (cause) {
        error.value = message(cause);
        return false;
      } finally {
        approvedNavigation = false;
      }
      // 路由/弹窗关闭已销毁实例时，卸载流程负责草稿清理；不能再重新打开草稿通道。
      if (!alive) return true;
      if (discardDraftOnLeave) {
        await drafts.discard();
        children.forEach((child) => child.cancel());
        hydrateModel(cleanModel.value);
        revision++;
        await drafts.open();
        discardDraftOnLeave = false;
      }
      session++;
      invalidate();
      children.forEach((child) => child.cancel());
      form?.clear();
      return true;
    },
  };
  useCrudFormLifecycle(controller);
  return controller;
}

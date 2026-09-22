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
 * 将模块 CrudFormConfig 装配为新增/编辑页的单实体控制器。
 *
 * @typeParam Model 页面编辑模型。
 * @typeParam Entity 服务端详情实体。
 * @typeParam Id 实体稳定主键。
 * @param config 模块 form 配置。
 * @param options 上下文、导航、初始目标、列表失效 key 与草稿身份。
 * @returns 可传给 MyCrudForm 的 CrudFormController。
 * @remarks 控制器固定当前 target；不会监听全局路由而在后台 KeepAlive 页面加载其他实体。
 * 草稿仅保存 config.draft.fields 白名单和已登记子表快照。
 * @example `const controller = useCrudForm(config.form, { context: () => pageContext, invalidateViewKey: "base.customer.list" });`
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
    context: () => DeepReadonly<C>;
    navigation?: CrudNavigation<Id>;
    initialTarget?: CrudTarget<Id>;
    /** 保存成功后标记所属列表；列表恢复时才刷新。 */
    invalidateViewKey?: string;
    draftIdentity?: () => CrudDraftIdentity | undefined;
  }
): CrudFormController<Model, Entity, Id> {
  type State = {
    -readonly [K in keyof CrudFormController<Model, Entity, Id>["state"]]: CrudFormController<
      Model,
      Entity,
      Id
    >["state"][K];
  };
  // shallowRef 保留 Model 的字段关联；对外通过深只读视图暴露。
  const model = shallowRef(config.createInitial(options.context()));
  const baseline = shallowRef<Entity | null>(null);
  const hydrationRevision = shallowRef(0);
  function hydrateModel(value: Model) {
    model.value = cloneModel(value);
    hydrationRevision.value++;
  }
  const initialTarget = cloneModel<CrudTarget<Id>>(options.initialTarget ?? { mode: "add" });
  const target = shallowRef<CrudTarget<Id>>(initialTarget);
  // 编辑深链首屏直接进入加载态，避免先挂载可编辑控件再于同一周期卸载。
  const phase = shallowRef<State["phase"]>(
    initialTarget.mode === "edit" || config.beforeOpen ? "loading" : "ready"
  );
  const mutationOutcome = shallowRef<State["mutationOutcome"]>("none");
  const issues = shallowRef<readonly CrudIssue<Model>[]>([]);
  const error = shallowRef<string | null>(null);
  const cleanModel = shallowRef(cloneModel(model.value));
  let revision = 0,
    session = 0;
  let alive = true,
    closing = false;
  // 活跃状态属于当前组件实例；后台 KeepAlive 页不弹提示、不抢走前台路由。
  let active = true;
  let feedbackOperation: object | undefined;
  onActivated(() => {
    active = true;
  });
  onDeactivated(() => {
    active = false;
    if (feedbackOperation) dismissFeedback(feedbackOperation);
  });
  let approvedNavigation = false;
  let discardDraftOnLeave = false;
  let flightVersion = 0;
  const saveFlight = ref(false),
    registryRevision = ref(0);
  const channel = createRequestChannel();
  const children = new Map<
    FieldKey<Model>,
    {
      commit: (signal: AbortSignal) => Promise<{ proceed: boolean; reason?: string }>;
      validate: (
        value: Model,
        signal: AbortSignal,
        revision: number
      ) => Promise<CrudValidation<Model>>;
      cancel: () => void;
      lock: (value: boolean) => void;
      focus: (issue: CrudIssue<Model>) => Promise<void>;
      dirty: () => boolean;
      snapshotDraft?: () => unknown;
      restoreDraft?: (snapshot: unknown) => Promise<boolean>;
      stopDraft?: () => void;
    }
  >();
  let form: CrudFormPort<Model> | undefined;
  let receipt: { result: SaveResult; input: CrudSaveInput<Model, Entity, Id, C> } | undefined;
  const dirty = computed(() => {
    registryRevision.value;
    return (
      !sameModelValue(model.value, cleanModel.value) ||
      [...children.values()].some((child) => child.dirty())
    );
  });
  const childrenReady = computed(() => {
    registryRevision.value;
    return (config.childKeys ?? []).every((key) => children.has(key));
  });
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
  const critical = () => phase.value === "saving" || phase.value === "resolving";
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
      mutationOutcome.value !== "unknown" &&
      phase.value !== "committed-needs-sync" &&
      crudPermission(
        target.value.mode === "add" ? config.permissions?.create : config.permissions?.update
      ) &&
      !config.readonlyReason?.(snapshot(model.value), options.context()),
    children: () => children.entries(),
    patch: (value) => {
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
  const busy = () =>
    critical() ||
    phase.value === "committing" ||
    phase.value === "validating" ||
    phase.value === "loading";
  const snapshot = readonlyModel;
  const message = (cause: unknown) => (cause instanceof Error ? cause.message : "操作失败，请重试");
  function lock(value: boolean) {
    children.forEach((child) => child.lock(value));
  }
  function invalidate() {
    revision++;
    channel.cancel();
  }
  function patch(value: Partial<Model>) {
    if (
      !alive ||
      critical() ||
      phase.value === "loading" ||
      mutationOutcome.value === "unknown" ||
      (mutationOutcome.value === "committed" && phase.value === "committed-needs-sync")
    )
      return;
    if (config.readonlyReason?.(snapshot(model.value), options.context())) return;
    const next = { ...model.value, ...cloneModel(value) };
    if (sameModelValue(next, model.value)) return;
    model.value = next;
    revision++;
    issues.value = [];
    drafts.changed();
  }
  async function focusFirst() {
    const issue = issues.value[0];
    if (!issue) return;
    const child = issue.section
      ? [...children].find(([key]) => key === issue.section)?.[1]
      : undefined;
    if (child) await child.focus(issue);
    else await form?.focus(issue);
  }
  async function guardLeave() {
    if (approvedNavigation) return true;
    if (critical() || phase.value === "committing" || phase.value === "validating" || closing)
      return false;
    closing = true;
    const version = revision;
    try {
      const guard = await config.beforeClose?.(
        { dirty: dirty.value, target: cloneModel(target.value) },
        { context: snapshot<C>(options.context()), signal: new AbortController().signal }
      );
      if (guard && !guard.proceed) {
        error.value = guard.reason;
        return false;
      }
      if (
        dirty.value ||
        phase.value === "committed-needs-sync" ||
        mutationOutcome.value === "unknown"
      ) {
        const notice =
          phase.value === "committed-needs-sync"
            ? "数据已提交，但尚未回填。离开不会撤销已提交的数据，确定离开吗？"
            : mutationOutcome.value === "unknown"
              ? "提交结果尚未核实，请核实后再进行写入。确定离开吗？"
              : "当前内容尚未保存，确定离开吗？";
        try {
          await ElMessageBox.confirm(notice, "离开页面", {
            confirmButtonText:
              config.draft &&
              mutationOutcome.value !== "unknown" &&
              phase.value !== "committed-needs-sync"
                ? "保留草稿并离开"
                : "离开",
            cancelButtonText:
              config.draft &&
              mutationOutcome.value !== "unknown" &&
              phase.value !== "committed-needs-sync"
                ? "丢弃草稿并离开"
                : "继续编辑",
            distinguishCancelAndClose: !!config.draft,
            type: "warning",
          });
          if (
            config.draft &&
            mutationOutcome.value !== "unknown" &&
            phase.value !== "committed-needs-sync" &&
            !drafts.pending &&
            !(await drafts.flush())
          )
            return false;
        } catch (cause) {
          if (
            cause === "cancel" &&
            config.draft &&
            mutationOutcome.value !== "unknown" &&
            phase.value !== "committed-needs-sync"
          )
            discardDraftOnLeave = true;
          else if (cause === "cancel" || cause === "close") return false;
          else throw cause;
        }
      }
      return alive && version === revision && !critical();
    } catch (cause) {
      error.value = message(cause);
      return false;
    } finally {
      closing = false;
    }
  }
  function waitForDraftDecision(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
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
  async function open(next: CrudTarget<Id>) {
    if (saveFlight.value) return false;
    if (approvedNavigation) approvedNavigation = false;
    else if (!(await guardLeave())) return false;
    session++;
    drafts.reset();
    invalidate();
    children.forEach((child) => child.cancel());
    form?.clear();
    receipt = undefined;
    target.value = cloneModel(next);
    baseline.value = null;
    mutationOutcome.value = "none";
    error.value = null;
    issues.value = [];
    const run = channel.start();
    phase.value = "loading";
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
      if (next.mode === "edit") {
        const entity = await config.load(next.id, input);
        if (!alive || !run.isCurrent()) return false;
        baseline.value = cloneModel(entity);
        hydrateModel(config.toModel(cloneModel(entity), options.context()));
      }
      cleanModel.value = cloneModel(model.value);
      phase.value = "ready";
      await drafts.open();
      if (!alive || !run.isCurrent()) return false;
      if (config.afterOpen) {
        if (drafts.pending) await waitForDraftDecision(run.signal);
        if (!alive || !run.isCurrent()) return false;
        phase.value = "loading";
        await config.afterOpen({
          ...input,
          model: snapshot(model.value),
          baseline: snapshot(baseline.value),
        });
        if (!alive || !run.isCurrent()) return false;
        phase.value = "ready";
      }
      return true;
    } catch (cause) {
      if (alive && run.isCurrent()) {
        error.value = message(cause);
        phase.value = "load-error";
      }
      return false;
    }
  }
  async function synchronize(
    saved: NonNullable<typeof receipt>,
    run: ReturnType<typeof channel.start>
  ) {
    phase.value = "resolving";
    try {
      const entity = await config.resolveSaved(saved.result, {
        ...saved.input,
        signal: run.signal,
      });
      if (!alive || !run.isCurrent()) return;
      const value = config.toModel(cloneModel(entity), saved.input.context);
      baseline.value = cloneModel(entity);
      hydrateModel(value);
      cleanModel.value = cloneModel(value);
      target.value = { mode: "edit", id: config.getKey(entity) };
      revision++;
      issues.value = [];
      form?.clear();
      children.forEach((child) => child.cancel());
      phase.value = "saved";
      await drafts.discard();
      await drafts.open();
      receipt = undefined;
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
        phase.value = "committed-needs-sync";
        error.value = `保存已提交，回填失败：${message(cause)}`;
      }
    }
  }
  async function save() {
    if (
      !alive ||
      busy() ||
      saveFlight.value ||
      closing ||
      phase.value === "load-error" ||
      phase.value === "committed-needs-sync" ||
      mutationOutcome.value === "unknown"
    )
      return;
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
    phase.value = "committing";
    error.value = null;
    issues.value = [];
    mutationOutcome.value = "none";
    const current = () => alive && run.isCurrent() && session === currentSession;
    try {
      if (config.fields.length && !form) throw new Error("主表单尚未登记，不能保存");
      for (const key of config.childKeys ?? [])
        if (!children.has(key)) throw new Error(`子模块尚未登记：${key}`);
      for (const [key, child] of children) {
        const result = await child.commit(run.signal);
        if (!current()) return;
        if (!result.proceed) {
          issues.value = [{ section: key, message: result.reason ?? "请完成明细草稿" }];
          phase.value = "ready";
          await focusFirst();
          return;
        }
      }
      await nextTick();
      if (!current()) return;
      lock(true);
      phase.value = "validating";
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
        phase.value = "ready";
        await focusFirst();
        return;
      }
      const guard = await config.beforeSave?.(input);
      if (!valid()) return;
      if (guard && !guard.proceed) {
        error.value = guard.reason;
        phase.value = "ready";
        return;
      }
      if (!crudPermission(permission)) {
        error.value = "保存权限已变化";
        phase.value = "ready";
        return;
      }
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
      if (!(await drafts.mark("pending"))) {
        error.value = "草稿提交保护标记写入失败，请重试后再提交";
        phase.value = "ready";
        return;
      }
      if (!valid()) return;
      phase.value = "saving";
      mutationOutcome.value = "pending";
      submitted = true;
      const result = await request();
      if (!current()) return;
      mutationOutcome.value = "committed";
      await drafts.mark("committed");
      if (!current()) return;
      receipt = { result, input };
      await synchronize(receipt, run);
    } catch (cause) {
      if (!current()) return;
      // 无幂等/提交查询协议，写入异常不能猜测服务端回滚。
      mutationOutcome.value = submitted
        ? (config.classifySaveError?.(cause) ?? "unknown")
        : "rejected";
      phase.value = "save-error";
      if (mutationOutcome.value === "rejected") await drafts.rejectSubmission();
      error.value =
        mutationOutcome.value === "unknown"
          ? `提交结果未知，请核实后重新进入页面：${message(cause)}`
          : message(cause);
    } finally {
      if (flight === flightVersion) saveFlight.value = false;
      if (current()) {
        if (phase.value === "validating" || phase.value === "committing") phase.value = "ready";
        lock(false);
      }
    }
  }
  async function retrySync() {
    if (!receipt || phase.value !== "committed-needs-sync") return;
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
  watch(
    options.context,
    () => {
      flightVersion++;
      saveFlight.value = false;
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
      mutationOutcome.value = outcomeUnknown ? "unknown" : "none";
      phase.value = "load-error";
      error.value = outcomeUnknown
        ? "上下文已变化，原提交结果需核实；请重新加载当前记录"
        : "上下文已变化，请重新加载当前记录";
    },
    { deep: true, flush: "sync" }
  );
  onBeforeUnmount(() => {
    if (discardDraftOnLeave) void drafts.discard();
    alive = false;
    session++;
    invalidate();
    children.forEach((child) => child.cancel());
    children.forEach((child) => child.stopDraft?.());
    children.clear();
  });
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

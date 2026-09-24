import { computed, onActivated, onMounted, reactive, ref } from "vue";
import { viewInvalidationRevision } from "./useViewInvalidation";
import type { DeepReadonly, UnwrapNestedRefs } from "vue";
import { useBusinessPage } from "./useBusinessPage";
import { useCrudList } from "./useCrudList";
import { useCrudForm } from "./useCrudForm";
import { useCrudDetail } from "./useCrudDetail";
import { useBatchActions } from "./useBatchActions";
import { crudPermission } from "./useCrudActions";
import { applyReferenceOverrides } from "@/components/business/fields/reference-overrides";
import { cloneReadonlyModel, readonlyModel } from "@/components/business/fields/model";
import type { BusinessModuleContract, Form, List, Detail } from "@/components/business/crud/module";
import type {
  CrudTableBinding,
  CrudNavigation,
  CrudTarget,
  CrudValidation,
} from "@/components/business/crud/types";
import type {
  CrudViewEnvironment,
  CrudPageModule,
  CrudChildBinding,
} from "@/components/business/crud/crud-page";

import { crudFormDisabledReason } from "@/components/business/crud/form-presentation";
import { useCrudChange } from "./useCrudChange";
import type {
  CrudListViewOptions,
  CrudFormViewOptions,
  CrudDetailViewOptions,
  CrudListView,
  CrudFormView,
  CrudDetailView,
} from "@/components/business/crud/crud-view";
/** 用 getter 转发原控制器状态，并补充本页状态；不复制模型，读取时始终得到当前值。 */
function projectState<A extends object, B extends object>(read: () => A, extra: B): A & B {
  /** 逐项定义读取方法的结果对象；每次读取都访问原控制器状态。 */
  const target = {};
  for (const key of Object.keys(read())) {
    Object.defineProperty(target, key, { enumerable: true, get: () => Reflect.get(read(), key) });
  }
  Object.defineProperties(target, Object.getOwnPropertyDescriptors(extra));
  // 所有 A/B 自有成员均以上述 getter/原描述符定义，恢复动态属性定义的静态形状。
  return target as A & B;
}
/**
 * 为列表、新增、编辑或详情页准备数据和操作方法。指定 view 后，将返回的 bindings 传给对应 MyCrud 组件即可使用。
 * @param module 业务模块的 config.ts 导出的配置，例如 customerModule。
 * @param options view 选择页面类型；state 定义页面额外数据；hooks 可在打开、保存等步骤追加处理。
 * @returns state 可读取页面数据和加载状态，custom 可用于核对框等本地数据；actions 提供操作方法；bindings 可直接通过 v-bind 传给组件。
 * @remarks 不创建全局 Store 或模型副本；表单关闭必须走 actions.back，模型更新走 patch/update。
 * @example
 * const { state, actions, bindings } = useCrudView(customerModule, { view: "add", state: () => ({ reviewed: false }) });
 */
export function useCrudView<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(module: CrudPageModule<T>, options: CrudListViewOptions<T, S>): CrudListView<T, S>;
export function useCrudView<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(module: CrudPageModule<T>, options: CrudFormViewOptions<T, S, "add">): CrudFormView<T, S>;
export function useCrudView<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(module: CrudPageModule<T>, options: CrudFormViewOptions<T, S, "edit">): CrudFormView<T, S>;
export function useCrudView<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(module: CrudPageModule<T>, options: CrudDetailViewOptions<T, S>): CrudDetailView<T, S>;
export function useCrudView<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(
  module: CrudPageModule<T>,
  options:
    | CrudListViewOptions<T, S>
    | CrudFormViewOptions<T, S, "add">
    | CrudFormViewOptions<T, S, "edit">
    | CrudDetailViewOptions<T, S>
): CrudListView<T, S> | CrudFormView<T, S> | CrudDetailView<T, S> {
  /** 当前页面的组织身份、导航和弹窗容器，列表、表单及详情共用。 */
  const base = useBusinessPage(module);
  /** 模块提供的上下文转换函数，将公共页面信息转换成业务所需结构。 */
  const resolveContext = module.context;
  /** 模块提供的 ID 解析函数，在路由字符串进入业务层时校验并恢复类型。 */
  const parseId = module.parseId;
  if (!resolveContext || !parseId)
    throw new Error(`${module.meta.key}：统一页面需要 context 和 parseId 适配`);
  /** 供本页面字段和接口使用的只读业务上下文，随组织或权限变化更新。 */
  const context = computed(() => readonlyModel(resolveContext(base.context.value)));
  // S 由工厂推导；省略工厂时默认空状态。此处仅恢复 Vue 对泛型工厂的解包类型。
  const state = reactive(options.state?.() ?? {}) as UnwrapNestedRefs<S>;
  /** 给页面回调读取 custom 的只读视图，回调返回 state 后才合并更新。 */
  const stateSnapshot = () => ({ custom: readonlyModel(state) });
  /** 统一页面跳转方法，业务 ID 仅在进入路由方法时转成字符串，可由页面覆盖。 */
  const navigation: CrudNavigation<T["Id"]> = {
    add: base.navigation.add,
    edit: (id) => base.navigation.edit(String(id)),
    detail: (id) => base.navigation.detail(String(id)),
    saved: (id) => base.navigation.saved(String(id)),
    close: base.navigation.close,
    ...options.navigation,
  };
  /** 根据当前模块和页面模式生成列表、表单及详情配置。 */
  const config = module.createViewConfig(navigation, options.view === "edit" ? "edit" : "add");
  /** 读取最新新增权限，打开新增和恢复缓存页时都重新判断。 */
  const createPermitted = () => crudPermission(config.form.permissions?.create);
  /** 没有新增权限时，新增入口及页面使用的统一提示。 */
  const createDenied = "当前账号没有新增该单据的权限，请联系管理员授权，或联系相关人员新增。";
  /** 保留原新增导航，权限通过后再调用，避免包装后的方法调用自己。 */
  const originalAdd = navigation.add;
  navigation.add = async () => {
    if (!createPermitted()) throw new Error(createDenied);
    await originalAdd?.();
  };
  if (options.view === "add" || options.view === "edit") {
    config.form = {
      ...config.form,
      fields: applyReferenceOverrides(config.form.fields, options.form?.references),
    };
  }
  /** 为页面容器绑定保存后刷新方法，供弹窗或抽屉内容保存后刷新来源。 */
  function hostBinding(refresh: () => Promise<void>): CrudViewEnvironment["host"] {
    return { presentation: base.presentation, afterSave: refresh };
  }
  // 只创建当前页面需要的控制器；列表在此返回，不再创建表单或详情状态。
  if (options.view === "list") {
    /** 当前页面额外配置的业务回调，在模块通用回调之后执行。 */
    const hooks = options.hooks;
    /** 在模块列表配置上追加本页查询前后处理，保留模块原有检查顺序。 */
    const listConfig: List<T> = {
      ...config.list,
      beforeQuery: async (
        query: Parameters<NonNullable<typeof config.list.beforeQuery>>[0],
        input: Parameters<NonNullable<typeof config.list.beforeQuery>>[1]
      ) => {
        const guard = await config.list.beforeQuery?.(query, input);
        input.signal.throwIfAborted();
        if (guard && !guard.proceed) return guard;
        return (
          (await hooks?.beforeQuery?.({ ...input, query, state: stateSnapshot() })) ?? {
            proceed: true,
          }
        );
      },
      afterQuery: async (
        result: Parameters<NonNullable<typeof config.list.afterQuery>>[0],
        input: Parameters<NonNullable<typeof config.list.afterQuery>>[1]
      ) => {
        await config.list.afterQuery?.(result, input);
        input.signal.throwIfAborted();
        await hooks?.afterQuery?.({
          ...input,
          rows: result.list,
          total: result.total,
          state: stateSnapshot(),
        });
      },
    };
    if (!config.list.beforeQuery && !hooks?.beforeQuery) delete listConfig.beforeQuery;
    if (!config.list.afterQuery && !hooks?.afterQuery) delete listConfig.afterQuery;
    /** 批量操作与列表共用的交互锁，防止批量处理中再执行列表操作。 */
    const lock = ref(false);
    /** 本页唯一列表控制器，管理查询、选择和列表按钮。 */
    const list = useCrudList(listConfig, () => context.value, {
      invalidationKey: config.key,
      disabled: () => lock.value,
      preference: () => base.preference.value,
    });
    /** 页面配置了批量动作时才创建；复用列表选择和查询条件。 */
    const batch = options.batch
      ? useBatchActions({
          module,
          config: listConfig,
          list,
          context: () => context.value,
          lock,
          ...options.batch,
        })
      : undefined;
    /** 列表的弹窗容器绑定；其中的业务保存成功后重新查询列表。 */
    const listHost = hostBinding(list.refresh);
    /** 即时读取列表组件需要的参数，保持上下文和列偏好身份随状态更新。 */
    const listBinding = () => ({
      config: listConfig,
      controller: list,
      context: context.value,
      navigation,
      scopeKey: base.context.value.scopeKey,
      preference: base.preference.value,
      batch,
      createPermitted: createPermitted(),
      guideMode: module.page?.guideMode,
      host: listHost,
    });
    /** 将列表控制器状态和本页 custom、分页等信息合并为可直接读取的对象。 */
    const viewState = projectState(() => list.state, {
      custom: state,
      get busy() {
        return list.state.loading || !!list.state.busyActionKey || !!batch?.busy;
      },
      notice: base.notice,
      get invalidReason() {
        return undefined;
      },
      pagination: {
        get pageNum() {
          return list.state.pageNum;
        },
        get pageSize() {
          return list.state.pageSize;
        },
        get total() {
          return list.state.total;
        },
      },
    });
    // 单独公开操作方法；状态由上方 viewState 提供，避免动作对象里混入状态快照。
    const { state: _state, actionResult: _result, ...commands } = list;
    return {
      state: viewState,
      actions: {
        ...commands,
        navigation: navigation,
        back: async () => {
          await navigation.close?.();
        },
      },
      bindings: {
        get list() {
          return listBinding();
        },
        host: listHost,
      },
    };
  }
  /** 页面创建时捕获的原始 ID，后台缓存页不会读取其他页面的新路由 ID。 */
  const rawId = base.entityId;
  /** 按模块规则解析后的业务 ID；缺失或非法时为 null，阻止加载记录。 */
  const id = rawId === null ? null : parseId(rawId);
  // 详情加载本实例的固定 ID，并提供整页及独立工具栏、描述区两种组件绑定。
  if (options.view === "detail") {
    /** 当前页面额外配置的业务回调，在模块通用回调之后执行。 */
    const hooks = options.hooks;
    /** 追加当前详情页打开前后的回调，继续使用模块原有读取与转换方法。 */
    const detailConfig: Detail<T> = {
      ...config.detail,
      beforeOpen: async (
        id: T["Id"],
        input: Parameters<NonNullable<typeof config.detail.beforeOpen>>[1]
      ) => {
        await config.detail.beforeOpen?.(id, input);
        input.signal.throwIfAborted();
        const result = await hooks?.beforeOpen?.({
          ...input,
          state: stateSnapshot(),
          target: { mode: "detail", id },
        });
        input.signal.throwIfAborted();
        if (result?.state) Object.assign(state, result.state);
      },
      afterOpen: async (
        entity: Parameters<NonNullable<typeof config.detail.afterOpen>>[0],
        model: Parameters<NonNullable<typeof config.detail.afterOpen>>[1],
        input: Parameters<NonNullable<typeof config.detail.afterOpen>>[2]
      ) => {
        await config.detail.afterOpen?.(entity, model, input);
        input.signal.throwIfAborted();
        await hooks?.afterOpen?.({ ...input, entity, model, state: stateSnapshot() });
      },
    };
    if (!config.detail.beforeOpen && !hooks?.beforeOpen) delete detailConfig.beforeOpen;
    if (!config.detail.afterOpen && !hooks?.afterOpen) delete detailConfig.afterOpen;
    /** 本页唯一详情控制器，负责加载固定记录和执行详情动作。 */
    const detail = useCrudDetail(detailConfig, () => context.value);
    /** 详情中的业务容器保存完成后，刷新当前详情。 */
    const detailHost = hostBinding(detail.refresh);
    /** 详情最近确认的数据变化版本，成功刷新后才推进。 */
    let handledInvalidation = viewInvalidationRevision(config.key);
    /** 缓存详情恢复时检查模块是否被写入，按本实例 ID 刷新过期记录。 */
    onActivated(() => {
      const revision = viewInvalidationRevision(config.key);
      if (revision === handledInvalidation || detail.state.phase === "loading") return;
      // 只刷新当前实例绑定的记录；后台缓存页不读取其他标签的路由参数。
      if (id !== null)
        void detail.load(id).then(() => {
          if (detail.state.phase === "ready") handledInvalidation = revision;
        });
    });
    /** 首次挂载只加载已解析出有效 ID 的详情。 */
    onMounted(() => {
      if (id !== null) void detail.load(id);
    });
    /** 在详情已加载且有权限、没有业务只读限制时打开当前记录的编辑界面。 */
    const edit = async () => {
      if (
        detail.state.id !== null &&
        detail.state.phase === "ready" &&
        !detail.busyActionKey &&
        crudPermission(config.form.permissions?.update) &&
        detail.state.model &&
        !config.form.readonlyReason?.(detail.state.model, context.value)
      )
        await navigation.edit?.(cloneReadonlyModel<T["Id"]>(detail.state.id));
    };
    /** 缓存详情组件的参数；上下文、记录或权限变化时重算，工具栏和状态读取共用结果。 */
    const detailBinding = computed(() => ({
      controller: detail,
      fields: config.detail.fields,
      tabs: config.detail.tabs,
      summary: config.detail.summary,
      actions: config.detail.actions,
      context: context.value,
      back: navigation.close,
      columns: base.columns,
      layout: base.layout,
      entityLabel: base.entityLabel,
      host: detailHost,
      edit,
      canEdit: crudPermission(config.form.permissions?.update) && detail.state.id !== null,
      editReason: detail.state.model
        ? config.form.readonlyReason?.(detail.state.model, context.value)
        : undefined,
    }));
    /** 供独立 MyDesc 使用的只读模型；未加载时不提供描述区绑定。 */
    const descriptionModel = computed(() =>
      detail.state.model ? cloneReadonlyModel<T["Model"]>(detail.state.model) : undefined
    );
    return {
      state: projectState(() => detail.state, {
        custom: state,
        get busy() {
          return detail.state.phase === "loading" || !!detail.busyActionKey;
        },
        notice: base.notice,
        invalidReason: id === null ? "详情缺少记录 ID，请返回列表重新打开" : undefined,
        get canEdit() {
          return detailBinding.value.canEdit;
        },
        get editReason() {
          return detailBinding.value.editReason;
        },
      }),
      actions: {
        refresh: detail.refresh,
        runAction: detail.runAction,
        actionAvailability: detail.actionAvailability,
        edit: edit,
        back: async () => {
          await navigation.close?.();
        },
        navigation: navigation,
      },
      bindings: {
        get detail() {
          return detailBinding.value;
        },
        get toolbar() {
          const { controller, actions, back } = detailBinding.value;
          return {
            controller,
            actions,
            back,
            edit: edit,
            canEdit: detailBinding.value.canEdit,
            editReason: detailBinding.value.editReason,
          };
        },
        feedback: { controller: detail },
        get description() {
          if (!detail.state.model) return undefined;
          const { fields, context, columns } = detailBinding.value;
          return {
            fields,
            context,
            columns,
            modelValue: descriptionModel.value!,
          };
        },
        host: detailHost,
      },
    };
  }
  /** 当前页面额外配置的业务回调，在模块通用回调之后执行。 */
  const hooks = options.hooks;
  /** 在模块表单回调之后追加页面逻辑；校验问题合并，关闭和保存检查可阻止后续步骤。 */
  // 新增和编辑共用表单流程；模块回调先执行，再追加本页面回调及 custom 数据。
  const formConfig: Form<T> = {
    ...config.form,
    beforeOpen: async (input) => {
      if (input.target.mode === "add" && !createPermitted()) throw new Error(createDenied);
      const common = await config.form.beforeOpen?.(input);
      input.signal.throwIfAborted();
      if (options.view !== input.target.mode) throw new Error("页面场景与初始化目标不一致");
      let defaults: Partial<T["Model"]> | undefined;
      if (options.view === "add" && input.target.mode === "add") {
        const result = await options.hooks?.beforeOpen?.({
          ...input,
          target: input.target,
          state: stateSnapshot(),
        });
        input.signal.throwIfAborted();
        if (result?.state) Object.assign(state, result.state);
        defaults = result?.defaults;
      } else if (options.view === "edit" && input.target.mode === "edit") {
        const result = await options.hooks?.beforeOpen?.({
          ...input,
          target: input.target,
          state: stateSnapshot(),
        });
        input.signal.throwIfAborted();
        if (result?.state) Object.assign(state, result.state);
      }
      return common || defaults ? { ...common, ...defaults } : undefined;
    },
    afterOpen: async (input) => {
      await config.form.afterOpen?.(input);
      input.signal.throwIfAborted();
      await hooks?.afterOpen?.({ ...input, state: stateSnapshot() });
    },
    validate: async (input) => {
      const common = await config.form.validate?.(input);
      input.signal.throwIfAborted();
      const local = await hooks?.validate?.({ ...input, state: stateSnapshot() });
      const results = [common, local].filter((item): item is CrudValidation<T["Model"]> => !!item);
      const issues = results.flatMap((result) => (result.valid ? [] : [...result.issues]));
      return results.some((result) => !result.valid) ? { valid: false, issues } : { valid: true };
    },
    beforeSave: async (input) => {
      const guard = await config.form.beforeSave?.(input);
      input.signal.throwIfAborted();
      if (guard && !guard.proceed) return guard;
      if (changes.pending.value || changes.error.value)
        return { proceed: false, reason: changes.error.value ?? "字段变化处理中，请稍后保存" };
      return (await hooks?.beforeSave?.({ ...input, state: stateSnapshot() })) ?? { proceed: true };
    },
    afterSave: async (entity, input) => {
      await config.form.afterSave?.(entity, input);
      input.signal.throwIfAborted();
      await hooks?.afterSave?.({ ...input, entity, state: stateSnapshot() });
    },
    beforeClose: async (value, context) => {
      const guard = await config.form.beforeClose?.(value, context);
      if (guard && !guard.proceed) return guard;
      return (await hooks?.beforeClose?.(value)) ?? { proceed: true };
    },
  };
  if (options.view !== "add" && !config.form.beforeOpen && !hooks?.beforeOpen)
    delete formConfig.beforeOpen;
  // 没有配置扩展时移除空包装或复用原函数，避免让空回调影响加载和保存流程。
  if (!config.form.afterOpen && !hooks?.afterOpen) delete formConfig.afterOpen;
  if (!hooks?.validate) formConfig.validate = config.form.validate;
  if (!hooks?.beforeSave && !hooks?.change) formConfig.beforeSave = config.form.beforeSave;
  if (!hooks?.afterSave) formConfig.afterSave = config.form.afterSave;
  if (!hooks?.beforeClose) formConfig.beforeClose = config.form.beforeClose;
  /** 表单首次打开的目标；编辑缺少 ID 时由 invalidReason 阻止初始化和使用。 */
  const target: CrudTarget<T["Id"]> =
    options.view === "add" ? { mode: "add" } : id !== null ? { mode: "edit", id } : { mode: "add" };
  /** 本页唯一表单控制器，持有主表模型、子表登记以及保存与草稿流程。 */
  const form = useCrudForm(formConfig, {
    context: () => context.value,
    navigation,
    initialTarget: target,
    invalidateViewKey: config.key,
    draftIdentity: base.draftIdentity,
  });
  /** 按模型字段缓存子表绑定，重复渲染时复用同一对象。 */
  const childBindings = new Map<string, unknown>();
  /** 表单中的嵌入页面容器，不自动重载当前表单以免覆盖未保存输入。 */
  const formHost = hostBinding(async () => {});
  /** 完整表单和独立字段区共用的参数；上下文、只读状态和实体 key 按需读取。 */
  const formProps = {
    host: formHost,
    controller: form,
    fields: formConfig.fields,
    sections: formConfig.sections,
    links: module.links,
    get context() {
      return context.value;
    },
    columns: base.columns,
    layout: base.layout,
    entityLabel: base.entityLabel,
    get readonlyReason() {
      return form.readonlyReason;
    },
    get entityKey() {
      const current = cloneReadonlyModel<CrudTarget<T["Id"]>>(form.state.target);
      return current.mode === "edit" ? current.id : ("new" as const);
    },
  };
  // 无权限进入的缓存新增页，在恢复权限后首次激活才初始化；普通切页不重开、不覆盖草稿。
  let initiallyOpened = false;
  /** 仅首次具备权限和有效目标时初始化表单，普通标签切换不覆盖已有输入。 */
  function openInitial() {
    if (initiallyOpened) return;
    if ((options.view === "add" && createPermitted()) || (options.view === "edit" && id !== null)) {
      initiallyOpened = true;
      void form.open(target);
    }
  }
  /** 表单首次挂载时尝试初始化，权限不足则等待后续激活。 */
  onMounted(openInitial);
  /** 缓存表单恢复时仅补做尚未执行的首次初始化。 */
  onActivated(openInitial);
  /** 给页面显示无法使用的原因，例如缺少新增权限或编辑 ID。 */
  const invalidReason = () =>
    options.view === "add" && !createPermitted()
      ? createDenied
      : options.view === "edit" && id === null
        ? "编辑缺少记录 ID，请返回列表重新打开"
        : undefined;
  /** 按模型数组字段找到模块子表并创建一次绑定；配置缺失时明确报错。 */
  const childBinding: CrudChildBinding<T> = (key) => {
    let binding = childBindings.get(key);
    // 同一子表只创建一次绑定，后续渲染直接复用，避免反复登记与丢失编辑状态。
    if (!binding) {
      const child = Object.values(module.children).find((child) => child.modelKey === key);
      binding = child?.createBinding?.(form);
      if (binding) childBindings.set(key, binding);
    }
    if (!binding) throw new Error("子表未配置视图绑定：" + key);
    // 同一 module.children 按 modelKey 建立绑定；条件数组类型在 Map 边界恢复。
    return binding as CrudTableBinding<
      T["Model"][typeof key] extends readonly (infer Row extends object)[] ? Row : never
    >;
  };
  /** 处理字段确认后的异步联动，其忙碌或失败状态会阻止保存。 */
  const changes = useCrudChange<T, S>(
    { controller: form, custom: state, context: () => context.value },
    options.hooks?.change
  );
  /** 在基础表单参数上补充字段联动的状态和重试入口。 */
  const formBinding = () => ({
    ...formProps,
    change: changes.change,
    changePending: changes.pending.value,
    changeError: changes.error.value,
    retryChange: changes.retry,
  });
  /** 工具栏和反馈区共用的表单状态及联动重试方法，不另建一份状态。 */
  const feedback = {
    controller: form,
    get readonlyReason() {
      return form.readonlyReason;
    },
    get changePending() {
      return changes.pending.value;
    },
    get changeError() {
      return changes.error.value;
    },
    retryChange: changes.retry,
  };
  /** 优先提示字段联动失败或进行中，再使用表单通用保存限制。 */
  const saveDisabledReason = () =>
    crudFormDisabledReason(form, undefined, {
      changeError: changes.error.value,
      changePending: changes.pending.value,
    });

  return {
    state: projectState(() => form.state, {
      custom: state,
      get busy() {
        return form.busy;
      },
      notice: base.notice,
      get invalidReason() {
        return invalidReason();
      },
      get changing() {
        return changes.pending.value;
      },
      get changeError() {
        return changes.error.value;
      },
      get readonlyReason() {
        return form.readonlyReason;
      },
      get savePermission() {
        return form.savePermission;
      },
      get canSave() {
        return !saveDisabledReason();
      },
      get saveDisabledReason() {
        return saveDisabledReason();
      },
      get canClose() {
        return !form.busy;
      },
      get childrenReady() {
        return form.childrenReady !== false;
      },
    }),
    actions: {
      retryChange: changes.retry,
      patch: form.patch,
      save: form.save,
      retrySync: form.retrySync,
      open: form.open,
      canLeave: form.canLeave,
      back: form.close,
      navigation: navigation,
    },
    bindings: {
      get form() {
        return formBinding();
      },
      get fields() {
        return formBinding();
      },
      toolbar: feedback,
      feedback,
      child: childBinding,
    },
  };
}

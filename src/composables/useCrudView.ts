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
/** 将同一控制器状态投射为 getter，不复制模型；解构返回的 state 对象仍能追踪更新。 */
function projectState<A extends object, B extends object>(read: () => A, extra: B): A & B {
  const target = {};
  for (const key of Object.keys(read())) {
    Object.defineProperty(target, key, { enumerable: true, get: () => Reflect.get(read(), key) });
  }
  Object.defineProperties(target, Object.getOwnPropertyDescriptors(extra));
  // 所有 A/B 自有成员均以上述 getter/原描述符定义，恢复动态属性定义的静态形状。
  return target as A & B;
}
/**
 * 按场景装配唯一控制器，返回 state/actions/bindings，模板直接引用真实业务组件。
 * @param module 模块配置；context/parseId 与稳定身份沿用原配置。
 * @param options 场景、辅助状态工厂和追加生命周期；工厂结果放 state.custom。
 * @returns state 为原状态的实时只读投射（custom 可写），actions 复用命令，bindings 供组件装配。
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
  const base = useBusinessPage(module);
  const resolveContext = module.context;
  const parseId = module.parseId;
  if (!resolveContext || !parseId)
    throw new Error(`${module.meta.key}：统一页面需要 context 和 parseId 适配`);
  const context = computed(() => readonlyModel(resolveContext(base.context.value)));
  // S 由工厂推导；省略工厂时默认空状态。此处仅恢复 Vue 对泛型工厂的解包类型。
  const state = reactive(options.state?.() ?? {}) as UnwrapNestedRefs<S>;
  const stateSnapshot = () => ({ custom: readonlyModel(state) });
  const navigation: CrudNavigation<T["Id"]> = {
    add: base.navigation.add,
    edit: (id) => base.navigation.edit(String(id)),
    detail: (id) => base.navigation.detail(String(id)),
    saved: (id) => base.navigation.saved(String(id)),
    close: base.navigation.close,
    ...options.navigation,
  };
  const config = module.createViewConfig(navigation, options.view === "edit" ? "edit" : "add");
  const createPermitted = () => crudPermission(config.form.permissions?.create);
  const createDenied = "当前账号没有新增该单据的权限，请联系管理员授权，或联系相关人员新增。";
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
  function hostBinding(refresh: () => Promise<void>): CrudViewEnvironment["host"] {
    return { presentation: base.presentation, afterSave: refresh };
  }
  if (options.view === "list") {
    const hooks = options.hooks;
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
    const lock = ref(false);
    const list = useCrudList(listConfig, () => context.value, {
      invalidationKey: config.key,
      disabled: () => lock.value,
      preference: () => base.preference.value,
    });
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
    const listHost = hostBinding(list.refresh);
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
  const rawId = base.entityId;
  const id = rawId === null ? null : parseId(rawId);
  if (options.view === "detail") {
    const hooks = options.hooks;
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
    const detail = useCrudDetail(detailConfig, () => context.value);
    const detailHost = hostBinding(detail.refresh);
    let handledInvalidation = viewInvalidationRevision(config.key);
    onActivated(() => {
      const revision = viewInvalidationRevision(config.key);
      if (revision === handledInvalidation || detail.state.phase === "loading") return;
      // 只刷新当前实例绑定的记录；后台缓存页不读取其他标签的路由参数。
      if (id !== null)
        void detail.load(id).then(() => {
          if (detail.state.phase === "ready") handledInvalidation = revision;
        });
    });
    onMounted(() => {
      if (id !== null) void detail.load(id);
    });
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
    const detailBinding = () => ({
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
    });
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
          return detailBinding().canEdit;
        },
        get editReason() {
          return detailBinding().editReason;
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
          return detailBinding();
        },
        get toolbar() {
          const { controller, actions, back } = detailBinding();
          return {
            controller,
            actions,
            back,
            edit: edit,
            canEdit: detailBinding().canEdit,
            editReason: detailBinding().editReason,
          };
        },
        feedback: { controller: detail },
        get description() {
          if (!detail.state.model) return undefined;
          const { fields, context, columns } = detailBinding();
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
  const hooks = options.hooks;
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
  if (!config.form.afterOpen && !hooks?.afterOpen) delete formConfig.afterOpen;
  if (!hooks?.validate) formConfig.validate = config.form.validate;
  if (!hooks?.beforeSave && !hooks?.change) formConfig.beforeSave = config.form.beforeSave;
  if (!hooks?.afterSave) formConfig.afterSave = config.form.afterSave;
  if (!hooks?.beforeClose) formConfig.beforeClose = config.form.beforeClose;
  const target: CrudTarget<T["Id"]> =
    options.view === "add" ? { mode: "add" } : id !== null ? { mode: "edit", id } : { mode: "add" };
  const form = useCrudForm(formConfig, {
    context: () => context.value,
    navigation,
    initialTarget: target,
    invalidateViewKey: config.key,
    draftIdentity: base.draftIdentity,
  });
  const childBindings = new Map<string, unknown>();
  const formHost = hostBinding(async () => {});
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
  function openInitial() {
    if (initiallyOpened) return;
    if ((options.view === "add" && createPermitted()) || (options.view === "edit" && id !== null)) {
      initiallyOpened = true;
      void form.open(target);
    }
  }
  onMounted(openInitial);
  onActivated(openInitial);
  const invalidReason = () =>
    options.view === "add" && !createPermitted()
      ? createDenied
      : options.view === "edit" && id === null
        ? "编辑缺少记录 ID，请返回列表重新打开"
        : undefined;
  const childBinding: CrudChildBinding<T> = (key) => {
    let binding = childBindings.get(key);
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
  const changes = useCrudChange<T, S>(
    { controller: form, custom: state, context: () => context.value },
    options.hooks?.change
  );
  const formBinding = () => ({
    ...formProps,
    change: changes.change,
    changePending: changes.pending.value,
    changeError: changes.error.value,
    retryChange: changes.retry,
  });
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
  const saveDisabledReason = () =>
    changes.error.value ||
    (changes.pending.value ? "字段变化处理中" : crudFormDisabledReason(form));

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

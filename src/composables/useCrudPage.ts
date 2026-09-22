import { ElAlert } from "element-plus";
import "element-plus/es/components/alert/style/css";
import { lazyCrudView, defineCrudAsyncView } from "@/components/business/crud/lazy-view";
import { computed, h, onActivated, onMounted, reactive, ref } from "vue";
import { viewInvalidationRevision } from "./useViewInvalidation";
import type { Slots, Slot, DeepReadonly, UnwrapNestedRefs, VNode } from "vue";
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
  CrudFormController,
  CrudTableBinding,
  CrudNavigation,
  CrudTarget,
  CrudValidation,
} from "@/components/business/crud/types";
import type { CrudChildRenderer } from "@/components/business/crud/child-view";
import type {
  CrudViewEnvironment,
  CrudPageModule,
  CrudListPageOptions,
  CrudFormPageOptions,
  CrudDetailPageOptions,
  CrudListPage,
  CrudFormPage,
  CrudDetailPage,
} from "@/components/business/crud/crud-page";

// 模块级异步组件复用加载结果；不同场景不下载另外两个页面视图。
import type ListComponent from "@/components/business/crud/MyCrudList.vue";
import type FormComponent from "@/components/business/crud/MyCrudForm.vue";
import type DetailComponent from "@/components/business/crud/MyCrudDetail.vue";
const ActionButton = defineCrudAsyncView(() => import("@/components/business/ActionButton.vue"));

/**
 * 创建一个列表/新增/编辑/详情实例，复用原控制器，不复制模型、草稿或请求状态。
 * @param module defineBusinessModule 返回的模块；context/parseId 显式适配身份。
 * @param options 固定 view、可选辅助状态工厂及页面专属 hooks。
 * @returns 按 view 收窄的页面端口；state 可编辑，控制器 state 只读。
 * @remarks 钩子追加到公共流程；仅创建当前场景控制器，页面卸载由各控制器取消请求。
 * @example
 * `const page = useCrudPage(customerModule, { view: "add", state: () => ({ hint: "" }) });`
 */
export function useCrudPage<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(module: CrudPageModule<T>, options: CrudListPageOptions<T, S>): CrudListPage<T, S>;
export function useCrudPage<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(module: CrudPageModule<T>, options: CrudFormPageOptions<T, S, "add">): CrudFormPage<T, S>;
export function useCrudPage<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(module: CrudPageModule<T>, options: CrudFormPageOptions<T, S, "edit">): CrudFormPage<T, S>;
export function useCrudPage<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(module: CrudPageModule<T>, options: CrudDetailPageOptions<T, S>): CrudDetailPage<T, S>;
export function useCrudPage<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(
  module: CrudPageModule<T>,
  options:
    | CrudListPageOptions<T, S>
    | CrudFormPageOptions<T, S, "add">
    | CrudFormPageOptions<T, S, "edit">
    | CrudDetailPageOptions<T, S>
): CrudListPage<T, S> | CrudFormPage<T, S> | CrudDetailPage<T, S> {
  const ListView = lazyCrudView<
    Parameters<
      typeof ListComponent<T["Model"], T["Id"], T["Schema"], T["Scope"], T["Query"], T["Context"]>
    >[0]
  >(() => import("@/components/business/crud/MyCrudList.vue"));
  const FormView = lazyCrudView<
    Parameters<typeof FormComponent<T["Model"], T["Entity"], T["Id"], T["Context"]>>[0]
  >(() => import("@/components/business/crud/MyCrudForm.vue"));
  const DetailView = lazyCrudView<
    Parameters<typeof DetailComponent<T["Model"], T["Entity"], T["Id"], T["Context"]>>[0]
  >(() => import("@/components/business/crud/MyCrudDetail.vue"));
  const base = useBusinessPage(module);
  const resolveContext = module.context;
  const parseId = module.parseId;
  if (!resolveContext || !parseId)
    throw new Error(`${module.meta.key}：统一页面需要 context 和 parseId 适配`);
  const context = computed(() => readonlyModel(resolveContext(base.context.value)));
  // S 由工厂推导；省略工厂时默认空状态。此处仅恢复 Vue 对泛型工厂的解包类型。
  const state = reactive(options.state?.() ?? {}) as UnwrapNestedRefs<S>;
  const stateSnapshot = () => readonlyModel(state);
  const navigation: CrudNavigation<T["Id"]> = {
    add: base.navigation.add,
    edit: (id) => base.navigation.edit(String(id)),
    detail: (id) => base.navigation.detail(String(id)),
    saved: (id) => base.navigation.saved(String(id)),
    close: base.navigation.close,
    ...options.navigation,
  };
  const config = module.createRuntime(navigation, options.view === "edit" ? "edit" : "add");
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
  function contentSlots(slots: Slots): Record<string, Slot | undefined> {
    const { "before-content": _before, "after-content": _after, ...content } = slots;
    return content;
  }
  function frame(slots: Slots, content: VNode) {
    return h("div", { class: "page-container crud-page" }, [
      base.notice ? h(ElAlert, { title: base.notice, type: "info", closable: false }) : null,
      slots["before-content"]?.(),
      content,
      slots["after-content"]?.(),
    ]);
  }
  function hostBinding(refresh: () => Promise<void>): CrudViewEnvironment["host"] {
    return { presentation: base.presentation, afterSave: refresh };
  }
  function children<E, I extends string | number>(
    read: () => DeepReadonly<T["Model"]>,
    form?: CrudFormController<T["Model"], E, I>
  ) {
    const views = new Map<string, CrudChildRenderer>();
    for (const child of Object.values(module.children)) {
      if (child.mountView) views.set(child.modelKey, child.mountView(read, form));
    }
    return views;
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
    return {
      view: "list",
      notice: base.notice,
      invalidReason: undefined,
      host: listHost,
      bindings: {
        get list() {
          return {
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
          };
        },
      },
      state,
      navigation,
      list,
      batch,
      get busy() {
        return list.state.loading || !!list.state.busyActionKey || !!batch?.busy;
      },
      render: (slots) =>
        frame(
          slots,
          h(
            ListView,
            {
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
            },
            contentSlots(slots)
          )
        ),
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
      if (revision === handledInvalidation) return;
      // 只刷新当前实例绑定的记录；后台缓存页不读取其他标签的路由参数。
      if (id !== null)
        void detail.load(id).then(() => {
          if (detail.state.phase === "ready") handledInvalidation = revision;
        });
    });
    // 只有实体模型存在时才读取子行；详情首屏由原控制器展示加载态。
    const views = children(() => {
      if (!detail.state.model) throw new Error("详情尚未加载");
      return detail.state.model;
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
    return {
      view: "detail",
      notice: base.notice,
      invalidReason: id === null ? "详情缺少记录 ID，请返回列表重新打开" : undefined,
      host: detailHost,
      edit,
      get canEdit() {
        return crudPermission(config.form.permissions?.update) && detail.state.id !== null;
      },
      get editReason() {
        return detail.state.model
          ? config.form.readonlyReason?.(detail.state.model, context.value)
          : undefined;
      },
      bindings: {
        get detail() {
          return {
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
          };
        },
      },
      state,
      navigation,
      detail,
      get busy() {
        return detail.state.phase === "loading" || !!detail.busyActionKey;
      },
      render(slots) {
        if (id === null)
          return frame(slots, h("p", { role: "alert" }, "详情缺少记录 ID，请返回列表重新打开"));
        const forwarded: Record<string, Slot | undefined> = contentSlots(slots);
        for (const [key, view] of views)
          forwarded[`tab-${key}`] = () => [view.render(slots[`tab-${key}`])];
        forwarded.actions = () =>
          [
            crudPermission(config.form.permissions?.update) && detail.state.id !== null
              ? h(ActionButton, {
                  label: "编辑",
                  tone: "primary",
                  link: false,
                  disabled: detail.state.phase !== "ready" || !!detail.busyActionKey,
                  disabledReason: detail.state.model
                    ? config.form.readonlyReason?.(detail.state.model, context.value)
                    : undefined,
                  onClick: edit,
                })
              : null,
            ...(slots.actions?.() ?? []),
          ].filter((node): node is VNode => node !== null);
        return frame(
          slots,
          h(
            DetailView,
            {
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
            },
            forwarded
          )
        );
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
  if (!hooks?.beforeSave) formConfig.beforeSave = config.form.beforeSave;
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
  const views = children(() => form.state.model, form);
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
  return {
    view: options.view,
    notice: base.notice,
    get invalidReason() {
      return options.view === "add" && !createPermitted()
        ? createDenied
        : options.view === "edit" && id === null
          ? "编辑缺少记录 ID，请返回列表重新打开"
          : undefined;
    },
    host: formHost,
    child(key) {
      const binding = views.get(key)?.binding;
      if (!binding) throw new Error("子表未配置视图绑定：" + key);
      // views 由同一 module.children 按 modelKey 建立；条件数组类型在 Map 边界恢复。
      return binding as CrudTableBinding<
        T["Model"][typeof key] extends readonly (infer Row extends object)[] ? Row : never
      >;
    },
    state,
    navigation,
    form,
    bindings: {
      get form() {
        return { ...formProps };
      },
    },
    get busy() {
      return form.busy;
    },
    render(slots) {
      if (options.view === "add" && !createPermitted())
        return frame(slots, h("p", { role: "status" }, createDenied));
      if (options.view === "edit" && id === null)
        return frame(slots, h("p", { role: "alert" }, "编辑缺少记录 ID，请返回列表重新打开"));
      const forwarded: Record<string, Slot | undefined> = contentSlots(slots);
      for (const [key, view] of views)
        forwarded[`section-${key}`] = () => [view.render(slots[`section-${key}`])];
      return frame(slots, h(FormView, { ...formProps }, forwarded));
    },
  };
}

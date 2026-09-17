import { crudFormDisabledReason } from "@/components/business/crud/form-presentation";
import { cloneReadonlyModel } from "@/components/business/fields/model";
import { useCrudChange } from "./useCrudChange";
import type { BusinessModuleContract } from "@/components/business/crud/module";
import type { CrudPageFormHooks, CrudPageModule } from "@/components/business/crud/crud-page";
import type {
  CrudListViewOptions,
  CrudFormViewOptions,
  CrudDetailViewOptions,
  CrudListView,
  CrudFormView,
  CrudDetailView,
} from "@/components/business/crud/crud-view";
import { useCrudPage } from "./useCrudPage";

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
/** 钩子读取只读快照；这里只调整命名空间，原模型/context/signal 不变。 */
function hookInput<I extends { state: object }>(
  input: I
): Omit<I, "state"> & {
  state: { readonly custom: I["state"] };
} {
  const { state, ...rest } = input;
  return { ...rest, state: { custom: state } };
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
  if (options.view === "list") {
    const { beforeQuery, afterQuery } = options.hooks ?? {};
    const source = useCrudPage(module, {
      ...options,
      hooks: {
        beforeQuery: beforeQuery ? (input) => beforeQuery(hookInput(input)) : undefined,
        afterQuery: afterQuery ? (input) => afterQuery(hookInput(input)) : undefined,
      },
    });
    const state = projectState(() => source.list.state, {
      custom: source.state,
      get busy() {
        return source.busy;
      },
      notice: source.notice,
      get invalidReason() {
        return source.invalidReason;
      },
      pagination: {
        get pageNum() {
          return source.list.state.pageNum;
        },
        get pageSize() {
          return source.list.state.pageSize;
        },
        get total() {
          return source.list.state.total;
        },
      },
    });
    const { state: _state, actionResult: _result, ...commands } = source.list;
    return {
      state,
      actions: {
        ...commands,
        navigation: source.navigation,
        back: async () => {
          await source.navigation.close?.();
        },
      },
      bindings: {
        get list() {
          return source.bindings.list;
        },
        host: source.host,
      },
    };
  }
  if (options.view === "detail") {
    const { beforeOpen, afterOpen } = options.hooks ?? {};
    const source = useCrudPage(module, {
      ...options,
      hooks: {
        beforeOpen: beforeOpen ? (input) => beforeOpen(hookInput(input)) : undefined,
        afterOpen: afterOpen ? (input) => afterOpen(hookInput(input)) : undefined,
      },
    });
    return {
      state: projectState(() => source.detail.state, {
        custom: source.state,
        get busy() {
          return source.busy;
        },
        notice: source.notice,
        invalidReason: source.invalidReason,
        get canEdit() {
          return source.canEdit;
        },
        get editReason() {
          return source.editReason;
        },
      }),
      actions: {
        refresh: source.detail.refresh,
        runAction: source.detail.runAction,
        actionAvailability: source.detail.actionAvailability,
        edit: source.edit,
        back: async () => {
          await source.navigation.close?.();
        },
        navigation: source.navigation,
      },
      bindings: {
        get detail() {
          return source.bindings.detail;
        },
        get toolbar() {
          const { controller, actions, back } = source.bindings.detail;
          return {
            controller,
            actions,
            back,
            edit: source.edit,
            canEdit: source.canEdit,
            editReason: source.editReason,
          };
        },
        feedback: { controller: source.detail },
        get description() {
          if (!source.detail.state.model) return undefined;
          const { fields, context, columns } = source.bindings.detail;
          return {
            fields,
            context,
            columns,
            modelValue: cloneReadonlyModel<T["Model"]>(source.detail.state.model),
          };
        },
        host: source.host,
      },
    };
  }
  const { afterOpen, validate, beforeSave, afterSave, beforeClose } = options.hooks ?? {};
  const hooks: Omit<CrudPageFormHooks<T, S, "add">, "beforeOpen"> = {
    afterOpen: afterOpen ? (input) => afterOpen(hookInput(input)) : undefined,
    validate: validate ? (input) => validate(hookInput(input)) : undefined,
    beforeSave:
      options.hooks?.change || beforeSave
        ? async (input) => {
            if (changes.pending.value || changes.error.value)
              return {
                proceed: false,
                reason: changes.error.value ?? "字段变化处理中，请稍后保存",
              };
            return beforeSave ? beforeSave(hookInput(input)) : { proceed: true };
          }
        : undefined,
    afterSave: afterSave ? (input) => afterSave(hookInput(input)) : undefined,
    beforeClose,
  };
  const formOptions = options;
  function createForm() {
    if (formOptions.view === "add") {
      const beforeOpen = formOptions.hooks?.beforeOpen;
      return useCrudPage(module, {
        ...formOptions,
        hooks: {
          ...hooks,
          beforeOpen: beforeOpen ? (input) => beforeOpen(hookInput(input)) : undefined,
        },
      });
    }
    const beforeOpen = formOptions.hooks?.beforeOpen;
    return useCrudPage(module, {
      ...formOptions,
      hooks: {
        ...hooks,
        beforeOpen: beforeOpen ? (input) => beforeOpen(hookInput(input)) : undefined,
      },
    });
  }
  const source = createForm();
  const changes = useCrudChange(source, options.hooks?.change);
  const formBinding = () => ({
    ...source.bindings.form,
    change: changes.change,
    changePending: changes.pending.value,
    changeError: changes.error.value,
    retryChange: changes.retry,
  });
  const feedback = {
    controller: source.form,
    get readonlyReason() {
      return source.form.readonlyReason;
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
    (changes.pending.value ? "字段变化处理中" : crudFormDisabledReason(source.form));

  return {
    state: projectState(() => source.form.state, {
      custom: source.state,
      get busy() {
        return source.busy;
      },
      notice: source.notice,
      get invalidReason() {
        return source.invalidReason;
      },
      get changing() {
        return changes.pending.value;
      },
      get changeError() {
        return changes.error.value;
      },
      get readonlyReason() {
        return source.form.readonlyReason;
      },
      get savePermission() {
        return source.form.savePermission;
      },
      get canSave() {
        return !saveDisabledReason();
      },
      get saveDisabledReason() {
        return saveDisabledReason();
      },
      get canClose() {
        return !source.form.busy;
      },
      get childrenReady() {
        return source.form.childrenReady !== false;
      },
    }),
    actions: {
      retryChange: changes.retry,
      patch: source.form.patch,
      save: source.form.save,
      retrySync: source.form.retrySync,
      open: source.form.open,
      canLeave: source.form.canLeave,
      back: source.form.close,
      navigation: source.navigation,
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
      child: source.child,
    },
  };
}

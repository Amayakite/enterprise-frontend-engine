import {
  computed,
  onActivated,
  onDeactivated,
  onBeforeUnmount,
  readonly,
  shallowRef,
  watch,
  type DeepReadonly,
} from "vue";
import { cloneModel, readonlyModel } from "@/components/business/fields/model";
import { createRequestChannel } from "@/utils/request-channel";
import type { CrudDetailConfig, CrudDetailController } from "@/components/business/crud/types";
import { useCrudActions } from "./useCrudActions";

/**
 * 将模块 CrudDetailConfig 装配为详情页读取与动作控制器。
 *
 * @returns 可传给 MyCrudDetail 的 CrudDetailController。
 * @remarks 详情只拥有读取状态；业务写动作由共享动作协调器执行。重复 load 会取消旧请求，
 * 迟到结果不会覆盖新详情。
 * @example `const controller = useCrudDetail(config.detail, () => pageContext); await controller.load(id);`
 */
export function useCrudDetail<Entity, Model, Id extends string | number, C>(
  config: CrudDetailConfig<Entity, Model, Id, C>,
  context: () => DeepReadonly<C>
): CrudDetailController<Model, Entity, Id> {
  const state = shallowRef<{
    id: Id | null;
    phase: "idle" | "loading" | "ready" | "error";
    entity: Entity | null;
    model: Model | null;
    error: string | null;
  }>({ id: null, phase: "idle", entity: null, model: null, error: null });
  const channel = createRequestChannel();
  let alive = true;
  let active = true;
  let contextChanged = false;
  let revision = 0;
  async function load(id: Id) {
    if (!alive) return;
    contextChanged = false;
    const run = channel.start();
    revision++;
    const snapshot = cloneModel(context());
    state.value = { id, phase: "loading", entity: null, model: null, error: null };
    try {
      const input = { signal: run.signal, context: snapshot };
      if (config.beforeOpen) await config.beforeOpen(id, input);
      if (!alive || !run.isCurrent()) return;
      const entity = await config.load(id, input);
      if (!alive || !run.isCurrent()) return;
      const model = config.toModel(cloneModel(entity), snapshot);
      if (config.afterOpen)
        await config.afterOpen(readonlyModel(entity), readonlyModel(model), input);
      if (!alive || !run.isCurrent()) return;
      state.value = { id, phase: "ready", entity: cloneModel(entity), model, error: null };
    } catch (cause) {
      if (!alive || !run.isCurrent()) return;
      state.value = {
        id,
        phase: "error",
        entity: null,
        model: null,
        error: cause instanceof Error ? cause.message : "详情加载失败，请重试",
      };
    }
  }
  const actionContext = computed(() => readonlyModel<C>(context()));
  const entity = computed(() => state.value.entity);
  const actionEntity = computed(() =>
    entity.value === null ? null : readonlyModel<Entity>(entity.value)
  );
  const actions = useCrudActions<Entity, Id, C>({
    actions: config.actions ?? [],
    context: (signal) => ({
      signal,
      context: actionContext.value,
      selectedRows: [],
      selectedKeys: [],
    }),
    row: (id, signal) =>
      state.value.id === id && state.value.entity !== null
        ? {
            signal,
            context: actionContext.value,
            selectedRows: [],
            selectedKeys: [],
            rowKey: id,
            row: actionEntity.value!,
          }
        : undefined,
    disabled: () => state.value.phase !== "ready",
    revision: () => revision,
    session: () => `${typeof state.value.id}:${state.value.id}:${JSON.stringify(context())}`,
    refresh: async () => {
      if (state.value.id !== null) await load(state.value.id);
      if (state.value.error) throw new Error(state.value.error);
    },
  });
  watch(
    () => state.value.phase,
    (phase) => {
      if (phase === "loading") actions.clearError();
    }
  );
  watch(
    context,
    () => {
      channel.cancel();
      revision++;
      // 后台页不读取新范围；立即丢弃旧范围内容，激活时仍加载本实例固定 ID。
      if (!active) {
        contextChanged = true;
        state.value = { ...state.value, phase: "idle", entity: null, model: null, error: null };
      } else if (state.value.id !== null) void load(state.value.id);
    },
    { deep: true }
  );
  onDeactivated(() => {
    active = false;
  });
  onActivated(() => {
    active = true;
    if (contextChanged && state.value.id !== null) void load(state.value.id);
  });
  onBeforeUnmount(() => {
    alive = false;
    channel.cancel();
  });
  return {
    get state() {
      return readonly(state).value;
    },
    load,
    refresh: async () => {
      if (state.value.id !== null) await load(state.value.id);
    },
    get busyActionKey() {
      return actions.busyKey.value;
    },
    get actionError() {
      return actions.error.value;
    },
    get actionResult() {
      return actions.result.value;
    },
    actionAvailability(key) {
      const action = config.actions?.find((item) => item.key === key);
      return action
        ? actions.availability(action, state.value.id ?? undefined)
        : { visible: false };
    },
    runAction: (key) => actions.run(key, state.value.id ?? undefined),
  };
}

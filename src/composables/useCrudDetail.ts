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
 * 根据模块 detail 配置加载记录、生成显示模型并执行详情按钮操作，返回值可传给 MyCrudDetail。
 *
 * @returns 可传给 MyCrudDetail 的 CrudDetailController。
 * @remarks 详情只拥有读取状态；业务写动作由共享动作协调器执行。重复 load 会取消旧请求，
 * 迟到结果不会覆盖新详情。
 * @example
 * `const controller = useCrudDetail(config.detail, () => pageContext); await controller.load(id);`
 */
export function useCrudDetail<Entity, Model, Id extends string | number, C>(
  config: CrudDetailConfig<Entity, Model, Id, C>,
  context: () => DeepReadonly<C>
): CrudDetailController<Model, Entity, Id> {
  /** 当前详情 ID、加载阶段、接口记录和显示模型；失败时清空旧记录避免误读。 */
  const state = shallowRef<{
    /** 本实例当前加载的记录 ID，尚未指定时为 null。 */
    id: Id | null;
    /** idle 未加载，loading 正在请求，ready 可展示，error 加载失败。 */
    phase: "idle" | "loading" | "ready" | "error";
    /** 接口原记录，供业务动作使用；未加载或失败时为 null。 */
    entity: Entity | null;
    /** 由接口原记录转换出的显示模型；未加载或失败时为 null。 */
    model: Model | null;
    /** 详情加载失败原因；没有错误时为 null。 */
    error: string | null;
  }>({ id: null, phase: "idle", entity: null, model: null, error: null });
  /** 仅允许最新一次详情加载回填，切换记录时取消旧请求。 */
  const channel = createRequestChannel();
  /** 实例是否仍存在，卸载后停止回填和加载。 */
  let alive = true;
  /** 缓存详情页是否在前台，决定上下文变化后何时重新读取。 */
  let active = true;
  /** 后台期间上下文已变化的标记，激活时补载当前固定 ID。 */
  let contextChanged = false;
  /** 详情数据版本，加载或上下文变化后使旧按钮确认失效。 */
  let revision = 0;
  /** 加载指定记录并转成显示模型；业务前后回调完成后才展示，过期响应丢弃。 */
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
      // 读取接口原记录后再转换显示模型，按钮操作仍使用完整原记录。
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
  /** 按钮执行时使用的只读组织和权限上下文。 */
  const actionContext = computed(() => readonlyModel<C>(context()));
  /** 提取当前接口记录，避免仅加载阶段变化时重建动作使用的只读记录。 */
  const entity = computed(() => state.value.entity);
  /** 供详情业务动作读取的只读接口记录，尚未加载时为 null。 */
  const actionEntity = computed(() =>
    entity.value === null ? null : readonlyModel<Entity>(entity.value)
  );
  /** 复用按钮权限、确认及执行逻辑，操作成功后刷新当前 ID。 */
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
  /** 开始重新加载详情时清除上次按钮错误。 */
  watch(
    () => state.value.phase,
    (phase) => {
      if (phase === "loading") actions.clearError();
    }
  );
  /** 组织或权限变化后取消旧请求；前台立即刷新，后台先清除旧范围数据。 */
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
  /** 记录详情页进入缓存，后续范围变化只标记待刷新。 */
  onDeactivated(() => {
    active = false;
  });
  /** 恢复显示后补载后台期间已变化的上下文。 */
  onActivated(() => {
    active = true;
    if (contextChanged && state.value.id !== null) void load(state.value.id);
  });
  /** 卸载后取消请求，避免旧详情响应继续写入。 */
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

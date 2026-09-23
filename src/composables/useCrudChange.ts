import { onBeforeUnmount, ref, watch } from "vue";
import type { BusinessModuleContract } from "@/components/business/crud/module";
import type { CrudFormController } from "@/components/business/crud/types";
import type { DeepReadonly, UnwrapNestedRefs } from "vue";
import type { CrudViewFormHooks } from "@/components/business/crud/crud-view";
import type { FormChange } from "@/components/business/fields/types";
import { readonlyModel } from "@/components/business/fields/model";
import { createRequestChannel } from "@/utils/request-channel";

/**
 * 字段确认变化后执行业务回调，例如查询关联信息并回填字段；新的输入会取消旧处理。
 * @param source 同一表单实例；不创建第二个控制器。
 * @param callback 可选 change 钩子；省略时不注册模型监听或创建请求通道。
 * @returns 字段事件入口、忙碌/错误和重试；结果只有当前事务可回填。
 * @remarks 输入、初始化和卸载使旧结果失效；业务外部副作用仍须透传 signal。
 * @example
 * const changes = useCrudChange(source, options.hooks?.change);
 */
export function useCrudChange<T extends BusinessModuleContract, S extends object>(
  source: {
    /** 当前唯一表单控制器。 */ controller: CrudFormController<T["Model"], T["Entity"], T["Id"]>;
    /** 本实例辅助状态，回调结果在有效请求内合并。 */ custom: UnwrapNestedRefs<S>;
    /** 当前上下文 getter；改变时取消旧字段事务。 */ context: () => DeepReadonly<T["Context"]>;
  },
  callback: CrudViewFormHooks<T, S, "add">["change"]
) {
  /** 业务 change 回调是否仍在执行；期间保存按钮需要等待。 */
  const pending = ref(false);
  /** 本次字段联动失败原因，供局部提示和重试入口显示。 */
  const error = ref<string | null>(null);
  if (!callback) return { pending, error, change: undefined, retry: async () => {} };
  /** 每次字段变化启动新请求，只允许最新一轮联动回填。 */
  const channel = createRequestChannel();
  /** 保留最近一次字段事件，仅在该次失败后用来重试。 */
  let latest: FormChange<T["Model"]> | undefined;
  /** 正在应用本次联动返回的 patch，避免模型监听把自己的回填当成新输入而取消。 */
  let applying = false;
  /** 取消旧联动并清理待重试事件和错误，不撤销已完成的业务副作用。 */
  function cancel() {
    channel.cancel();
    pending.value = false;
    error.value = null;
    latest = undefined;
  }
  /** 用户或其他流程改动模型时取消旧联动；本函数自己的回填除外。 */
  watch(
    () => source.controller.state.model,
    () => {
      if (!applying) cancel();
    },
    { flush: "sync" }
  );
  /** 重新加载记录时丢弃上一份模型的联动结果。 */
  watch(
    () => source.controller.state.phase,
    (phase) => {
      if (phase === "loading") cancel();
    },
    { flush: "sync" }
  );
  /** 上下文引用变化后取消旧联动，避免把旧组织的结果填入新页面。 */
  watch(() => source.context(), cancel, { flush: "sync" });
  /** 组件卸载后取消字段处理，避免继续更新已销毁表单。 */
  onBeforeUnmount(cancel);
  /** 将字段事件和只读页面状态交给业务回调；只应用当前请求的结果，失败保留重试信息。 */
  async function run(event: FormChange<T["Model"]>) {
    if (source.controller.busy || source.controller.readonlyReason) return;
    const request = channel.start();
    latest = event;
    pending.value = true;
    error.value = null;
    try {
      const result = await callback?.({
        ...event,
        state: { custom: readonlyModel(source.custom) },
        context: readonlyModel(source.context()),
        signal: request.signal,
      });
      // 回调可能等待了接口；只有仍属于最新一次字段变化的结果才能应用。
      if (!request.isCurrent()) return;
      // 暂时区分“本次回填”和“外部输入”，否则同步模型监听会取消正在完成的回调。
      applying = true;
      try {
        if (result?.state) Object.assign(source.custom, result.state);
        if (result?.patch) source.controller.patch(result.patch);
      } finally {
        applying = false;
      }
    } catch (cause) {
      if (request.isCurrent())
        error.value =
          cause instanceof Error
            ? cause.message || "字段变化处理失败，请重试"
            : "字段变化处理失败，请重试";
    } finally {
      if (request.isCurrent()) pending.value = false;
    }
  }
  return {
    pending,
    error,
    change: (event: FormChange<T["Model"]>) => {
      void run(event);
    },
    retry: async () => {
      if (latest && error.value) await run(latest);
    },
  };
}

import { onBeforeUnmount, ref, watch } from "vue";
import type { BusinessModuleContract } from "@/components/business/crud/module";
import type { CrudFormPage } from "@/components/business/crud/crud-page";
import type { CrudViewFormHooks } from "@/components/business/crud/crud-view";
import type { FormChange } from "@/components/business/fields/types";
import { readonlyModel } from "@/components/business/fields/model";
import { createRequestChannel } from "@/utils/request-channel";

/**
 * 为已确认字段事务追加可取消业务处理，复用原表单模型与请求通道。
 * @param source 同一表单实例；不创建第二个控制器。
 * @param callback 可选 change 钩子；省略时不注册模型监听或创建请求通道。
 * @returns 字段事件入口、忙碌/错误和重试；结果只有当前事务可回填。
 * @remarks 输入、初始化和卸载使旧结果失效；业务外部副作用仍须透传 signal。
 * @example
 * const changes = useCrudChange(source, options.hooks?.change);
 */
export function useCrudChange<T extends BusinessModuleContract, S extends object>(
  source: Pick<CrudFormPage<T, S>, "form" | "bindings" | "state">,
  callback: CrudViewFormHooks<T, S, "add">["change"]
) {
  const pending = ref(false);
  const error = ref<string | null>(null);
  if (!callback) return { pending, error, change: undefined, retry: async () => {} };
  const channel = createRequestChannel();
  let latest: FormChange<T["Model"]> | undefined;
  let applying = false;
  function cancel() {
    channel.cancel();
    pending.value = false;
    error.value = null;
    latest = undefined;
  }
  watch(
    () => source.form.state.model,
    () => {
      if (!applying) cancel();
    },
    { flush: "sync" }
  );
  watch(
    () => source.form.state.phase,
    (phase) => {
      if (phase === "loading") cancel();
    },
    { flush: "sync" }
  );
  watch(() => source.bindings.form.context, cancel, { flush: "sync" });
  onBeforeUnmount(cancel);
  async function run(event: FormChange<T["Model"]>) {
    if (source.form.busy || source.form.readonlyReason) return;
    const request = channel.start();
    latest = event;
    pending.value = true;
    error.value = null;
    try {
      const result = await callback?.({
        ...event,
        state: { custom: readonlyModel(source.state) },
        context: readonlyModel(source.bindings.form.context),
        signal: request.signal,
      });
      if (!request.isCurrent()) return;
      applying = true;
      try {
        if (result?.state) Object.assign(source.state, result.state);
        if (result?.patch) source.form.patch(result.patch);
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

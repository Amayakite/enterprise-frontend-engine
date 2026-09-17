import { onBeforeUnmount, readonly, ref, shallowRef } from "vue";
import { hasPerm } from "@/utils/auth";
import type {
  CrudAction,
  CrudActionContext,
  CrudActionResult,
  CrudRowActionContext,
} from "@/components/business/crud/types";

/**
 * 检查 CRUD 动作权限。
 * @remarks 数组采用“全部满足”语义，与指令数组“任一满足”不同。
 * @example `crudPermission(["base:customer:update", "base:customer:approve"])`
 */
export function crudPermission(permission?: string | readonly string[]): boolean {
  return (
    permission === undefined ||
    (typeof permission === "string"
      ? hasPerm(permission)
      : permission.every((item) => hasPerm(item)))
  );
}

/**
 * 协调列表/详情动作的权限、确认、单飞执行与刷新。
 *
 * @remarks 同一控制器同时只允许一个动作；写动作成功后刷新失败不会再次执行写入。
 * 请求在组件卸载时中止，revision 变化会丢弃旧结果。
 */
export function useCrudActions<Row, Id extends string | number, C>(options: {
  actions: readonly CrudAction<Row, Id, C>[];
  context: (signal: AbortSignal) => CrudActionContext<Row, Id, C>;
  row: (key: Id, signal: AbortSignal) => CrudRowActionContext<Row, Id, C> | undefined;
  revision: () => unknown;
  session: () => unknown;
  disabled: () => boolean;
  refresh: (strategy: "current-page" | "first-page") => Promise<void>;
}) {
  const busyKey = ref<string | null>(null);
  const error = ref<string | null>(null);
  const result = shallowRef<CrudActionResult<Id> | null>(null);
  let alive = true;
  const abort = new AbortController();
  function availability(action: CrudAction<Row, Id, C>, key?: Id, ownLock = false) {
    if (!crudPermission(action.permission)) return { visible: false, reason: "无操作权限" };
    const context =
      action.location === "row"
        ? key === undefined
          ? undefined
          : options.row(key, abort.signal)
        : options.context(abort.signal);
    if (!context) return { visible: false, reason: "记录已变化" };
    const evaluate = <T>(
      entry: { visible?: (value: T) => boolean; disabledReason?: (value: T) => string | undefined },
      value: T
    ) => ({
      visible: entry.visible?.(value) ?? true,
      reason: entry.disabledReason?.(value),
    });
    const view =
      action.location === "row"
        ? evaluate(action, options.row(key!, abort.signal)!)
        : evaluate(action, options.context(abort.signal));
    return {
      visible: view.visible,
      reason: options.disabled()
        ? "正在加载，请稍候"
        : busyKey.value && !ownLock
          ? "有操作正在进行"
          : view.reason,
    };
  }
  async function run(key: string, rowKey?: Id) {
    const action = options.actions.find((item) => item.key === key);
    if (!alive || !action || busyKey.value) return;
    const view = availability(action, rowKey);
    if (!view.visible || view.reason) return;
    const revision = options.revision();
    const session = options.session();
    busyKey.value = key;
    error.value = null;
    result.value = null;
    try {
      async function execute<T>(
        entry: {
          confirm?: (value: T) => { title: string; message: string };
          execute: (value: T) => Promise<CrudActionResult<Id>>;
          afterExecute?: (result: CrudActionResult<Id>, context: T) => Promise<void>;
        },
        context: T
      ) {
        const confirmation = entry.confirm?.(context);
        if (confirmation) {
          try {
            await ElMessageBox.confirm(confirmation.message, confirmation.title, {
              type: "warning",
              confirmButtonText: "确定",
              cancelButtonText: "取消",
            });
          } catch (cause) {
            if (cause === "cancel" || cause === "close") return;
            throw cause;
          }
        }
        if (
          !alive ||
          revision !== options.revision() ||
          !crudPermission(action!.permission) ||
          options.disabled()
        )
          return;
        const latest = availability(action!, rowKey, true);
        if (!latest.visible || latest.reason) return;
        const committed = await entry.execute(context);
        if (!alive || revision !== options.revision()) return;
        result.value = committed;
        try {
          await entry.afterExecute?.(committed, context);
        } catch (cause) {
          if (alive && session === options.session())
            error.value = `操作已完成，后续处理失败：${cause instanceof Error ? cause.message : "请检查当前状态"}`;
          return;
        }
        if (!alive || revision !== options.revision()) return;
        if (action!.refresh !== "none") {
          try {
            await options.refresh(action!.refresh ?? "current-page");
          } catch (cause) {
            if (alive && session === options.session())
              error.value = `操作已完成，刷新失败：${cause instanceof Error ? cause.message : "请手动刷新"}`;
          }
        }
      }
      if (action.location === "row") {
        if (rowKey === undefined) return;
        const context = options.row(rowKey, abort.signal);
        if (context) await execute(action, context);
      } else await execute(action, options.context(abort.signal));
    } catch (cause) {
      if (alive && revision === options.revision())
        error.value = cause instanceof Error ? cause.message : "操作失败";
    } finally {
      busyKey.value = null;
    }
  }
  onBeforeUnmount(() => {
    alive = false;
    abort.abort();
  });
  return {
    busyKey: readonly(busyKey),
    error: readonly(error),
    result: readonly(result),
    availability,
    run,
    clearError() {
      error.value = null;
    },
  };
}

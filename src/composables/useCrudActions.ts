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
 * @example
 * `crudPermission(["base:customer:update", "base:customer:approve"])`
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
 * 为列表和详情按钮统一检查权限、显示确认框、执行操作并刷新数据。
 *
 * @remarks 同一控制器同时只允许一个动作；写动作成功后刷新失败不会再次执行写入。
 * 请求在组件卸载时中止，revision 变化会丢弃旧结果。
 */
export function useCrudActions<Row, Id extends string | number, C>(options: {
  /** 当前页面声明的按钮集合，按 key 查找实际要执行的动作。 */
  actions: readonly CrudAction<Row, Id, C>[];
  /** 按给定取消信号生成一次工具栏操作的上下文及选择快照。 */
  context: (signal: AbortSignal) => CrudActionContext<Row, Id, C>;
  /** 按稳定行 ID 和取消信号生成行操作上下文；记录不存在时返回 undefined。 */
  row: (key: Id, signal: AbortSignal) => CrudRowActionContext<Row, Id, C> | undefined;
  /** 返回能表示数据、选择及范围变化的版本；确认后版本不同就停止执行。 */
  revision: () => unknown;
  /** 返回当前页面操作范围标识；后处理失败只向仍属于同一范围的页面提示。 */
  session: () => unknown;
  /** 返回是否暂时禁止操作，例如列表加载或批量执行期间。 */
  disabled: () => boolean;
  /** 操作成功后刷新当前页或第一页；失败应抛错，执行器会提示已完成但刷新失败。 */
  refresh: (strategy: "current-page" | "first-page") => Promise<void>;
}) {
  /** 正在执行的按钮 key；确认框开启时也占用，防止重复点击。 */
  const busyKey = ref<string | null>(null);
  /** 当前按钮执行或执行后刷新失败的提示。 */
  const error = ref<string | null>(null);
  /** 最近一次成功执行的回执；刷新失败仍保留它，避免误认为写入失败。 */
  const result = shallowRef<CrudActionResult<Id> | null>(null);
  /** 当前动作所属组件是否仍存在，卸载后不再回填或刷新。 */
  let alive = true;
  /** 组件卸载时取消其业务动作请求，通过 signal 传给调用方。 */
  const abort = new AbortController();
  /** 计算按钮是否显示及禁用原因；ownLock 仅供正在执行的按钮复查自身条件。 */
  function availability(action: CrudAction<Row, Id, C>, key?: Id, ownLock = false) {
    if (!crudPermission(action.permission)) return { visible: false, reason: "无操作权限" };
    const evaluate = <T>(
      entry: {
        /** 按当前动作数据决定按钮是否显示；省略时显示。 */
        visible?: (value: T) => boolean;
        /** 按当前动作数据返回禁用原因；undefined 表示没有额外限制。 */
        disabledReason?: (value: T) => string | undefined;
      },
      value: T | undefined
    ) =>
      value === undefined
        ? undefined
        : { visible: entry.visible?.(value) ?? true, reason: entry.disabledReason?.(value) };
    const view =
      action.location === "row"
        ? evaluate(action, key === undefined ? undefined : options.row(key, abort.signal))
        : evaluate(action, options.context(abort.signal));
    if (!view) return { visible: false, reason: "记录已变化" };
    return {
      visible: view.visible,
      reason: options.disabled()
        ? "正在加载，请稍候"
        : busyKey.value && !ownLock
          ? "有操作正在进行"
          : view.reason,
    };
  }
  /** 查找按钮、锁定一次操作并执行确认及业务处理；过期选择不继续提交。 */
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
      /** 对一份固定动作数据执行确认、写入、后处理和刷新，各阶段分别检查有效性。 */
      async function execute<T>(
        entry: {
          /** 根据操作数据生成确认框标题和内容；省略时直接进入执行前复查。 */
          confirm?: (value: T) => {
            /** 本次确认框的标题，通常使用业务动作名称。 */
            title: string;
            /** 本次确认的范围与影响说明，供用户核对后继续。 */
            message: string;
          };
          /** 执行一次业务操作并返回回执；失败抛错，不在此自动重试。 */
          execute: (value: T) => Promise<CrudActionResult<Id>>;
          /** 成功后追加处理，省略时跳过；失败会提示已执行成功，不能因此重发写请求。 */
          afterExecute?: (result: CrudActionResult<Id>, context: T) => Promise<void>;
        },
        context: T
      ) {
        // 确认框展示的是本次点击捕获的数据，确认后还要检查它是否仍然有效。
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
        // 用户等待确认期间可能换了范围、勾选或权限，这时停止执行旧操作。
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
        // 先记下已完成的写入，再做后处理；后处理或刷新失败都不能再次执行写动作。
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
  /** 卸载时中止请求，并阻止尚未完成的确认框继续发起操作。 */
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

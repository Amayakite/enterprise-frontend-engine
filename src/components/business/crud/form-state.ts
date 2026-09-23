import type { CrudFormController, CrudFormPhase } from "./types";

/** 表单流程阶段与服务端写入结果；权限、请求身份和草稿由控制器管理。 */
export interface CrudFormStatus {
  /** 当前流程阶段，不代表服务端事务状态。 */
  phase: CrudFormPhase;
  /** 最近一次写入结果；unknown 不允许直接重发。 */
  mutationOutcome: CrudFormController<object, unknown, string>["state"]["mutationOutcome"];
}

/**
 * 派生流程允许的操作；控制器与 UI 共用规则，不保存第二份状态。
 * @param status 当前阶段与写入结果。
 * @returns 阶段限制；最终执行仍须检查权限、请求身份、草稿和子表。
 * @remarks committing/validating 允许内部回写，保证子表提交和版本校验生效。
 * @example
 * const activity = crudFormActivity(controller.state);
 */
export function crudFormActivity(status: CrudFormStatus) {
  const { phase, mutationOutcome } = status;
  const critical = phase === "saving" || phase === "resolving";
  const preparing = phase === "committing" || phase === "validating";
  const busy = critical || preparing || phase === "loading";
  const reconciliationReason =
    phase === "committed-needs-sync"
      ? "保存已提交，请先回填"
      : mutationOutcome === "unknown"
        ? "提交结果待核实"
        : undefined;
  return {
    /** 正在写入或回填；不能更新模型或离开。 */ critical,
    /** 加载、准备或提交中；不启动另一次保存。 */ busy,
    /** 未核实结果或待回填的提示；undefined 表示无此限制。 */ reconciliationReason,
    /** 流程允许内部模型回写；业务只读规则仍须单独检查。 */
    canPatch: !critical && phase !== "loading" && !reconciliationReason,
    /** 离开检查可开始；加载可由导航取消，保存准备不能中断。 */
    canLeave: !critical && !preparing,
    /** 阶段导致的保存限制；undefined 表示继续检查业务条件。 */
    saveDisabledReason: busy
      ? "正在处理，请稍后"
      : phase === "load-error"
        ? "请先重新加载"
        : reconciliationReason,
  };
}

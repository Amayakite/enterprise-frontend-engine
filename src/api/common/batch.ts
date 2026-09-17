import request from "@/utils/request";

/** 批量操作请求：selected 传 ID/编码数组；query 由服务端执行全部匹配，绝非仅当前页。 */
export interface BatchRequest<Query> {
  /** 后端识别的模块组件码，不是前端路由或 DOM 组件名。 */
  componentKey: string;
  /** 本次操作码，例如 delete/disable；由 index 的动作声明提供。 */
  action: string;
  /** 请求追踪/幂等标识；是否真正幂等仍由后端保证，前端不会自动重试写入。 */
  requestId: string;
  /** 操作目标；query 必须包含固定数据范围和已应用条件。 */
  target:
    | {
        /** 勾选记录模式，仅操作显式提供的标识。 */
        mode: "selected";
        /** wire 参数名；默认 batchID，编码接口用 batchCode。 */
        field: "batchID" | "batchCode";
        /** 非空、去重后的标识数组，保留数字 0；不传整行对象。 */
        values: readonly (string | number)[];
      }
    | {
        /** 当前查询全部匹配，不受页码限制。 */
        mode: "query";
        /** 列表已应用查询 DTO，必须携带固定数据范围。 */
        query: Query;
      };
}
/** 统一批量反馈；失败明细须有服务端上限，大批次不要返回全部成功实体。 */
export interface BatchResult {
  /** 本次请求标识，可用于向后端核实结果。 */
  requestId: string;
  /** 服务端实际匹配数量。 */
  matched: number;
  /** 成功数量。 */
  succeeded: number;
  /** 失败数量；与 succeeded 之和等于 matched。 */
  failed: number;
  /** 有限的失败原因样本，不意味着这是全部失败项。 */
  failures: readonly {
    /** 失败项的主键/编码，或后端可追踪标识。 */
    key: string | number;
    /** 面向用户的原因，例如“已审核客户不可删除”，不能携带敏感堆栈。 */
    message: string;
  }[];
}
/** 将公共 target 转为后端 batchID/batchCode 参数；保留数组与真实值类型，不拼逗号。 */
export function toBatchBody<Query>(data: BatchRequest<Query>) {
  return {
    ...data,
    target:
      data.target.mode === "selected"
        ? { mode: "selected", [data.target.field]: [...data.target.values] }
        : data.target,
  };
}
/** 当前仅连接开发 Mock；正式统一端点就绪后只在此适配协议。 */
export function executeBatch<Query>(data: BatchRequest<Query>, signal: AbortSignal) {
  return request<unknown, BatchResult>({
    url: "/api/v1/pilot/batch",
    method: "post",
    data: toBatchBody(data),
    signal,
    errorPresentation: "local",
  });
}

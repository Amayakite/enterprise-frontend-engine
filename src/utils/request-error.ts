/** 请求失败的归属方；local 由发起业务的控制器显示，global 由请求层的兼容兜底显示。 */
export type RequestErrorOwner = "local" | "global";

/** 可供页面决定显示和保存后续动作的请求失败类别。 */
export type RequestErrorKind =
  | "business"
  | "permission"
  | "authentication"
  | "network"
  | "server"
  | "unknown";

/** 创建结构化请求错误时所需的、与 Axios 无关的传输信息。 */
export interface RequestErrorInput {
  /** 面向用户的失败说明；不应包含原始堆栈或敏感响应内容。 */
  message: string;
  /** 错误分类；业务拒绝和已明确的权限拒绝可安全地阻止重提。 */
  kind: RequestErrorKind;
  /** 当前提示的唯一归属方。 */
  owner: RequestErrorOwner;
  /** 后端业务码；协议未提供时为空。 */
  code?: string | number;
  /** HTTP 状态码；无响应的网络错误为空。 */
  status?: number;
  /** 后端返回的请求编号，供用户报障或后续查询。 */
  requestId?: string;
  /** 保留原始异常，仅供日志、诊断和上层兼容处理。 */
  cause?: unknown;
}

/**
 * 保留 API 拒绝、传输状态及反馈归属的错误对象。
 *
 * @remarks 不依赖 Axios，避免页面或保存控制器通过 transport 类型猜测业务语义。
 */
export class RequestError extends Error {
  /** 可供调用方决定是否可安全重提的失败类别。 */
  readonly kind: RequestErrorKind;
  /** 此错误应由请求层兜底还是调用方局部反馈显示。 */
  readonly owner: RequestErrorOwner;
  /** 后端业务码；非协议响应时为 undefined。 */
  readonly code: string | number | undefined;
  /** HTTP 响应状态；网络失败时为 undefined。 */
  readonly status: number | undefined;
  /** 后端请求编号；服务端未返回时为 undefined。 */
  readonly requestId: string | undefined;

  constructor(input: RequestErrorInput) {
    super(input.message);
    this.name = "RequestError";
    this.kind = input.kind;
    this.owner = input.owner;
    this.code = input.code;
    this.status = input.status;
    this.requestId = input.requestId;
    if (input.cause !== undefined) Object.defineProperty(this, "cause", { value: input.cause });
  }
}

/** 判断未知异常是否已由请求层归一化。 */
export function isRequestError(cause: unknown): cause is RequestError {
  return cause instanceof RequestError;
}

/**
 * 保守区分保存写入后的拒绝与结果未知。
 *
 * @remarks 只有服务端明确的业务/权限拒绝可判定为 rejected；网络中断、5xx、非协议响应和
 * 未归一化异常均不能假定服务端未写入，必须按 unknown 处理。
 */
export function classifyRequestSaveError(cause: unknown): "rejected" | "unknown" {
  return isRequestError(cause) && (cause.kind === "business" || cause.kind === "permission")
    ? "rejected"
    : "unknown";
}

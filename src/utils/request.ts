import axios, {
  type InternalAxiosRequestConfig,
  AxiosError,
  type AxiosResponse,
  type AxiosRequestConfig,
} from "axios";
import qs from "qs";

import { ApiCodeEnum } from "@/config/api-codes";
import { useUserStoreHook } from "@/stores/user";
import { usePermissionStoreHook } from "@/stores/permission";
import { AuthStorage, redirectToLogin } from "@/utils/auth";
import { feedback } from "@/utils/feedback";
import { RequestError, type RequestErrorKind, type RequestErrorOwner } from "@/utils/request-error";
import type { ApiResult } from "@/types/http";

// 防止同一请求在 token 刷新后重复进入重试，导致死循环
const retriedRequests = new WeakSet<InternalAxiosRequestConfig>();

const http = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API,
  timeout: 50000,
  headers: { "Content-Type": "application/json;charset=utf-8" },
  // 数组参数序列化为 ids=1&ids=2，而非 ids[]=1&ids[]=2
  paramsSerializer: (params) => qs.stringify(params, { arrayFormat: "repeat" }),
});

http.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = AuthStorage.getAccessToken();

    // 约定：调用方设置 Authorization 为 "no-auth" 即跳过 token 注入
    if (config.headers.Authorization === "no-auth") {
      delete config.headers.Authorization;
    } else if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

http.interceptors.response.use(
  (response: AxiosResponse<ApiResult>) => {
    const { responseType } = response.config;

    // 二进制数据直接透传
    if (responseType === "blob" || responseType === "arraybuffer") {
      return response;
    }

    const payload = responsePayload(response);
    const code = payload?.code;
    const msg = payload?.msg;

    if (code === ApiCodeEnum.SUCCESS) {
      return response;
    }

    if (
      code === ApiCodeEnum.ACCESS_TOKEN_INVALID ||
      code === ApiCodeEnum.REFRESH_TOKEN_INVALID ||
      code === ApiCodeEnum.PERMISSION_DENIED
    ) {
      return handleResponseError(
        new AxiosError(msg, code, response.config, response.request, response)
      );
    }
    const error = createResponseError(
      response,
      payload ? "business" : "unknown",
      msg || "系统出错"
    );
    presentRequestError(error);
    return Promise.reject(error);
  },

  handleResponseError
);

async function handleResponseError(error: AxiosError<ApiResult>) {
  if (axios.isCancel(error)) return Promise.reject(error);
  const { config, response } = error;

  if (!response) {
    const requestError = new RequestError({
      message: "网络连接失败",
      kind: "network",
      owner: errorOwner(config),
      code: error.code,
      cause: error,
    });
    presentRequestError(requestError);
    return Promise.reject(requestError);
  }

  const payload = responsePayload(response);
  const code = payload?.code;
  const msg = payload?.msg;

  // 网关/服务器错误即使碰巧带有业务码，也不能假定写入没有发生。
  if (response.status >= 500) {
    const requestError = createResponseError(response, "server", msg || "请求失败", error);
    presentRequestError(requestError);
    return Promise.reject(requestError);
  }

  // Token 过期
  if (code === ApiCodeEnum.ACCESS_TOKEN_INVALID) {
    if (!config || retriedRequests.has(config)) {
      await redirectToLogin("登录已过期，请重新登录");
      return Promise.reject(
        createResponseError(response, "authentication", "Token Invalid", error)
      );
    }

    retriedRequests.add(config);

    try {
      const userStore = useUserStoreHook();
      await userStore.refreshTokenOnce();

      const token = AuthStorage.getAccessToken();
      if (token) {
        config.headers.set("Authorization", `Bearer ${token}`);
      }

      return http(config);
    } catch {
      await redirectToLogin("登录已过期，请重新登录");
      return Promise.reject(
        createResponseError(response, "authentication", "Token refresh failed", error)
      );
    }
  }

  // Refresh token 失效
  if (code === ApiCodeEnum.REFRESH_TOKEN_INVALID) {
    await redirectToLogin("登录已过期，请重新登录", false);
    return Promise.reject(createResponseError(response, "authentication", "Token Invalid", error));
  }

  // 权限不足
  if (code === ApiCodeEnum.PERMISSION_DENIED) {
    const permissionStore = usePermissionStoreHook();
    try {
      await permissionStore.refreshPermissions();
    } catch {
      // 权限刷新只是纠正本地状态；失败不能掩盖服务器已明确拒绝本次请求的事实。
    }
    const requestError = createResponseError(response, "permission", msg || "权限不足", error);
    presentRequestError(requestError);
    return Promise.reject(requestError);
  }

  const requestError = createResponseError(
    response,
    payload ? "business" : "unknown",
    msg || "请求失败",
    error
  );
  presentRequestError(requestError);
  return Promise.reject(requestError);
}

function errorOwner(config?: AxiosRequestConfig): RequestErrorOwner {
  return config?.errorPresentation === "local" ? "local" : "global";
}

function responseRequestId(response: AxiosResponse<ApiResult>): string | undefined {
  const value = response.headers?.["x-request-id"] ?? response.headers?.["request-id"];
  return typeof value === "string" ? value : undefined;
}

function responsePayload(
  response: AxiosResponse<ApiResult>
): { code: string | number; msg?: string } | undefined {
  const data: unknown = response.data;
  if (!data || typeof data !== "object" || !("code" in data)) return;
  if (typeof data.code !== "string" && typeof data.code !== "number") return;
  return {
    code: data.code,
    msg: "msg" in data && typeof data.msg === "string" ? data.msg : undefined,
  };
}

function createResponseError(
  response: AxiosResponse<ApiResult>,
  kind: RequestErrorKind,
  message: string,
  cause?: unknown
): RequestError {
  return new RequestError({
    message,
    kind,
    owner: errorOwner(response.config),
    code: responsePayload(response)?.code,
    status: response.status,
    requestId: responseRequestId(response),
    cause,
  });
}

/** 仅为未迁移 API 保留全局兜底；local 错误由调用方的控制器负责呈现。 */
function presentRequestError(error: RequestError): void {
  if (error.owner === "global") feedback.error(error.message);
}

/**
 * 发起当前 API 协议请求；普通响应解包 data，二进制响应保留响应头。
 * @param config Axios 请求配置；沿用现有认证、错误提示与取消行为。
 * @returns blob/arraybuffer 返回 AxiosResponse，普通请求返回业务数据。
 * @remarks 泛型是 API 层声明的 DTO 合同，不表示对服务器数据做了运行时校验。
 * @example
 * `request<unknown, CustomerRecord>({ url: "/api/v1/pilot/customers/C001" })`
 */
function request(
  config: AxiosRequestConfig & { responseType: "blob" }
): Promise<AxiosResponse<Blob>>;
function request(
  config: AxiosRequestConfig & { responseType: "arraybuffer" }
): Promise<AxiosResponse<ArrayBuffer>>;
function request<T = unknown, R = T, D = unknown>(config: AxiosRequestConfig<D>): Promise<R>;
async function request(config: AxiosRequestConfig<unknown>): Promise<unknown> {
  const response = await http<ApiResult, AxiosResponse<ApiResult>, unknown>(config);
  if (config.responseType === "blob" || config.responseType === "arraybuffer") return response;
  return response.data.data;
}

export default request;

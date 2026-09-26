import request from "@/utils/request";
import type { LoginRequest, LoginResult } from "./types";

const AUTH_BASE_URL = "/api/v1/auth";

const AuthAPI = {
  login(data: LoginRequest) {
    const payload: Pick<LoginRequest, "username" | "password"> = {
      username: data.username,
      password: data.password,
    };

    return request<unknown, LoginResult>({
      url: `${AUTH_BASE_URL}/login`,
      method: "post",
      data: payload,
    });
  },

  refreshToken(refreshToken: string) {
    return request<unknown, LoginResult>({
      url: `${AUTH_BASE_URL}/refresh-token`,
      method: "post",
      params: { refreshToken },
      headers: {
        Authorization: "no-auth",
      },
    });
  },

  logout() {
    return request({
      url: `${AUTH_BASE_URL}/logout`,
      method: "delete",
    });
  },
};

export default AuthAPI;

// 重导出类型
export * from "./types";

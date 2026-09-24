/**
 * 校验文件地址并判断能否携带应用认证；禁止脚本、对象 URL、协议相对地址及反斜杠混淆。
 * @param value 文件 API 返回的原始 URL，允许站内绝对路径或 HTTP(S)。
 * @param origin 当前应用的 origin，例如 https://app.example.com。
 * @param apiBase 已配置的 API 基址，例如 /dev-api；绝对地址时信任其 origin。
 * @returns 规范化 URL 与认证策略；外域只能匿名读取。
 * @example
 * `resolveFileUrl("/api/v1/files/1", location.origin, "/dev-api")`
 */
export function resolveFileUrl(value: string, origin: string, apiBase: string) {
  if (
    value !== value.trim() ||
    /[\\\u0000-\u001f\u007f]/.test(value) ||
    !/^(https?:\/\/|\/[^/])/i.test(value)
  ) {
    throw new Error("文件地址无效，仅支持 HTTP(S) 或站内绝对路径。");
  }
  const parsed = new URL(value, origin);
  if (parsed.username || parsed.password) throw new Error("文件地址不能包含用户名或密码。");
  const apiOrigin = new URL(apiBase || "/", origin).origin;
  return {
    url: parsed.href,
    authenticated: parsed.origin === origin || parsed.origin === apiOrigin,
  };
}

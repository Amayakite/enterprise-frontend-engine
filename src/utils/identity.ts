/**
 * 用于表格/缓存等需要字符串键的边界，保留数字和字符串 ID 的区别。
 *
 * @param value 业务 ID；0 合法，数值必须是安全整数，字符串不可为空白。
 * @returns 带类型前缀的稳定键，如 `n:42` 或 `s:42`。
 * @throws ID 非法时抛出；不用于搜索或改变业务 ID。
 * @example `serializeStableKey(42) // "n:42"`
 */
export function serializeStableKey(value: string | number): string {
  if (typeof value === "number" && Number.isSafeInteger(value)) return `n:${value}`;
  if (typeof value === "string" && value.trim().length > 0) return `s:${value}`;
  throw new Error("稳定键必须是非空字符串或安全整数");
}

function hashScopePart(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * 生成参照缓存和查询会话使用的短范围键，隔离模块、组织、用户与权限集合。
 *
 * @remarks 权限只参与稳定指纹，不把 Token 或完整权限列表写入缓存键；服务端仍负责真实鉴权。
 * @example `createAccessScopeKey("base.customer", 1, "u-42", ["base:customer:read"])`
 */
export function createAccessScopeKey(
  moduleKey: string,
  organizationId: string | number,
  userId: string | number,
  permissions: readonly string[] = []
): string {
  if (!moduleKey.trim()) throw new Error("范围键模块不能为空");
  const normalizedPermissions = [...new Set(permissions)].sort();
  const permissionFingerprint = hashScopePart(normalizedPermissions.join("\u001f"));
  return [
    moduleKey.trim(),
    serializeStableKey(organizationId),
    serializeStableKey(userId),
    `p:${normalizedPermissions.length}:${permissionFingerprint}`,
  ].join(":");
}

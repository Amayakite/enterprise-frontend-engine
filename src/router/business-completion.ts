/** 单次跨页面新增的返回通道；只存在于当前页面生命周期，不落盘。 */
export interface BusinessCompletion {
  /** 来源固定 fullPath，不随全局路由变化。 */
  source: string;
  /** 保存 ID 交给来源业务验证和回写；不直接修改表单，失败可重试。 */
  saved?: (id: string) => Promise<void>;
}
const sessions = new Map<string, BusinessCompletion>();
/** 登记一次返回通道；由来源卸载时调用 dispose，最多同时保留 32 条。
 * @example
 * `const session = registerBusinessCompletion({ source: route.fullPath });`
 */
export function registerBusinessCompletion(value: BusinessCompletion) {
  if (sessions.size >= 32) throw new Error("待完成的新增页面过多，请先关闭部分页面");
  const token = crypto.randomUUID();
  sessions.set(token, value);
  return {
    token,
    dispose: () => {
      sessions.delete(token);
    },
  };
}
/** 查询仍存活的返回通道；来源卸载或 token 无效时返回 undefined。
 * @example
 * `getBusinessCompletion(route.query.businessSession)`
 */
export function getBusinessCompletion(token: unknown) {
  return typeof token === "string" ? sessions.get(token) : undefined;
}
/** 保存或取消完成后释放通道。
 * @example
 * `releaseBusinessCompletion(token)`
 */
export function releaseBusinessCompletion(token: unknown) {
  if (typeof token === "string") sessions.delete(token);
}

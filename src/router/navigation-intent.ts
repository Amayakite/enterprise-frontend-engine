import type { LocationQuery, LocationQueryRaw } from "vue-router";
import { getBusinessTarget } from "./business-targets";

/** 本次导航的来源元信息；不保存表单、函数或权限。 */
export interface NavigationSource {
  /** 当前应用内部规范地址；返回仍通过路由守卫。 */
  fullPath: string;
  /** 来源页中文标题；没有标题时使用“来源页面”。 */
  title: string;
}
/** 一次可消费的页面意图；在规范导航成功后交付。 */
export interface PageIntent {
  /** 随机导航标识，不参与缓存身份。 */
  token: string;
  /** 已登记目标 key。 */
  target: string;
  /** 本期 create 引导新增，view 仅保留返回来源。 */
  action: "create" | "view";
  /** 最终规范 fullPath，或受限页地址。 */
  destination: string;
  /** 可选本次应用内来源；外部链接无此值。 */
  source?: NavigationSource;
}
interface Entry {
  /** 到期时间；懒清理，无轮询。 */
  expires: number;
  /** 内存来源。 */
  source?: NavigationSource;
  /** 规范导航前准备的交付。 */
  intent?: PageIntent;
  /** 是否允许页面消费。 */
  ready: boolean;
  /** 是否已经被一个页面消费。 */
  consumed: boolean;
}
const keys = ["__navTarget", "__navAction", "__navToken"] as const;

/** 仅去除本能力的临时参数；保留业务 query 与草稿实例参数。
 * @example
 * `stripNavigationQuery(route.query)`
 */
export function stripNavigationQuery(query: LocationQuery): LocationQueryRaw {
  return Object.fromEntries(
    Object.entries(query).filter(([key]) => !keys.some((item) => item === key))
  );
}

/** 校验短标量参数与目标路径；无效意图不授权、不猜测。
 * @example
 * `parseNavigationIntent(route.path, route.query)`
 */
export function parseNavigationIntent(
  path: string,
  query: LocationQuery
): Pick<PageIntent, "target" | "token" | "action"> | undefined {
  const targetKey = query.__navTarget;
  const action = query.__navAction;
  const token = query.__navToken;
  if (
    typeof targetKey !== "string" ||
    targetKey.length > 100 ||
    (action !== "create" && action !== "view") ||
    typeof token !== "string" ||
    !/^[\w-]{1,80}$/.test(token)
  )
    return;
  const target = getBusinessTarget(targetKey);
  if (!target || !target.matches(path)) return;
  if (action === "create" && (!target.add || path !== target.list)) return;
  return { target: target.key, token, action };
}

/** 创建有界一次性邮箱；注入时钟用于行为测试，不落盘。
 * @param now 毫秒时钟，默认 Date.now。
 * @returns 来源、交付与订阅端口；最多 16 条，5 分钟到期。
 * @example
 * `const mailbox = createNavigationMailbox();`
 */
export function createNavigationMailbox(now: () => number = Date.now) {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  function prune() {
    for (const [key, entry] of entries) if (entry.expires <= now()) entries.delete(key);
  }
  function entry(token: string) {
    prune();
    let item = entries.get(token);
    if (!item) {
      if (entries.size >= 16) entries.delete(entries.keys().next().value!);
      item = { expires: now() + 300_000, ready: false, consumed: false };
      entries.set(token, item);
    }
    return item;
  }
  return {
    /** 建立应用内来源；非法外部路径被忽略。 */
    source(token: string, source: NavigationSource) {
      if (/^\/(?!\/)/.test(source.fullPath) && !/[\\\r\n]/.test(source.fullPath))
        entry(token).source = source;
    },
    /** 准备交付；只有随后 finish 成功才可消费。 */
    stage(intent: Omit<PageIntent, "source">) {
      const item = entry(intent.token);
      if (!item.consumed) item.intent = { ...intent, source: item.source };
    },
    /** 规范导航结果；token 存在时仅处理本次导航，省略时仅处理相同目的地。 */
    finish(destination: string, success: boolean, token?: string) {
      prune();
      for (const item of entries.values()) {
        if (!item.intent || item.ready || item.consumed) continue;
        if (token ? item.intent.token !== token : item.intent.destination !== destination) continue;
        if (success && item.intent.destination === destination) item.ready = true;
        else item.intent = undefined;
      }
      if (success) for (const listener of listeners) listener();
    },
    /** 某页面取得一次意图；消费后保留 token 防止重复。 */
    take(destination: string): PageIntent | undefined {
      prune();
      const item = [...entries.values()]
        .reverse()
        .find(
          (value) => value.ready && !value.consumed && value.intent?.destination === destination
        );
      if (!item?.intent) return;
      item.consumed = true;
      return item.intent;
    },
    /** 导航被取消时删除其记录。 */
    cancel(token: string) {
      entries.delete(token);
    },
    /** 订阅交付，返回释放函数；监听中只读取自身规范页面。 */
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** 退出账号清理；通知页面撤销旧提示。 */
    clear() {
      entries.clear();
      for (const listener of listeners) listener();
    },
    /** 当前有界记录数，仅供诊断。 */
    get size() {
      prune();
      return entries.size;
    },
  };
}

/** 当前浏览器会话的导航邮箱；只包含短期元数据。 */
export const navigationMailbox = createNavigationMailbox();

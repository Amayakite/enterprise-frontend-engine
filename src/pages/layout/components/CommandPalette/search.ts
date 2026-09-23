import Fuse from "fuse.js";
import type { LocationQueryRaw, RouteRecordRaw } from "vue-router";

/** 搜索条目只来自当前授权菜单，历史仅保存 path，不保存标题或业务参数。 */
export interface SearchItem {
  /** 当前菜单显示名称。 */
  title: string;
  /** 唯一的静态内部路径，不包括参数化或隐藏页面。 */
  path: string;
  /** 路由名和显式别名；不自动推测拼音。 */
  aliases: string[];
  /** 当前路由声明的查询参数，导航时重新读取。 */
  query: LocationQueryRaw;
}

/** 从授权路由提取可搜索菜单；排除隐藏、动态和外部路径，保留当前查询参数。
 * @example
 * `const items = collectSearchItems(permission.routes)`
 */
export function collectSearchItems(routes: readonly RouteRecordRaw[]): SearchItem[] {
  const items = new Map<string, SearchItem>();
  function visit(records: readonly RouteRecordRaw[], parent = "") {
    for (const route of records) {
      if (route.meta?.hidden || /^(?:https?:)?\/\//i.test(route.path)) continue;
      const path = (route.path.startsWith("/") ? route.path : `${parent}/${route.path}`).replace(
        /\/{2,}/g,
        "/"
      );
      if (route.children?.length) {
        visit(route.children, path);
        continue;
      }
      if (
        !route.meta?.title ||
        /[:*]/.test(path) ||
        ["/login", "/401", "/404", "/redirect"].includes(path)
      )
        continue;
      const query: LocationQueryRaw = {};
      for (const [key, value] of Object.entries(route.meta.params ?? {})) {
        if (value === null || typeof value === "string" || typeof value === "number")
          query[key] = value;
      }
      items.set(path, {
        title: route.meta.title === "dashboard" ? "首页" : route.meta.title,
        path,
        aliases: [
          ...(route.meta.searchAliases ?? []),
          ...(typeof route.name === "string" ? [route.name] : []),
        ],
        query,
      });
    }
  }
  visit(routes);
  return [...items.values()];
}

/** 构造菜单搜索索引；仅菜单变化时重建，返回含标题匹配位置的前 30 项。
 * @example
 * `const search = createMenuSearch(items); search("客户")`
 */
export function createMenuSearch(items: readonly SearchItem[]) {
  const index = new Fuse(items, {
    keys: [
      { name: "title", weight: 0.65 },
      { name: "aliases", weight: 0.25 },
      { name: "path", weight: 0.1 },
    ],
    threshold: 0.32,
    ignoreLocation: true,
    includeMatches: true,
  });
  return (keyword: string) => index.search(keyword.trim(), { limit: 30 });
}

/** 将标题匹配转为纯文本片段，不使用 HTML 注入。
 * @example
 * `highlightTitle("客户管理", [[0, 1]])`
 */
export function highlightTitle(title: string, ranges: readonly (readonly [number, number])[] = []) {
  const parts: { text: string; matched: boolean }[] = [];
  for (let i = 0; i < title.length; i++) {
    const matched = ranges.some(([start, end]) => i >= start && i <= end);
    const previous = parts.at(-1);
    if (previous?.matched === matched) previous.text += title[i];
    else parts.push({ text: title[i] ?? "", matched });
  }
  return parts;
}

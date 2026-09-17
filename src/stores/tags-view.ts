import { nextTick, ref } from "vue";
import { defineStore } from "pinia";
import { useRoute, useRouter } from "vue-router";
import type { LocationQuery } from "vue-router";
import { isExternal } from "@/utils/validate";
import { createViewLeaveGuardRegistry, createViewOperationLock } from "./view-leave-guards";

export interface TagView {
  name: string;
  title: string;
  path: string;
  fullPath: string;
  icon?: string;
  affix?: boolean;
  keepAlive?: boolean;
  query?: LocationQuery;
}

export interface TagsViewResult {
  visitedViews: TagView[];
  cachedViews: string[];
}

export interface DirectionalTagsViewResult {
  visitedViews: TagView[];
}

export const useTagsViewStore = defineStore("tagsView", () => {
  const visitedViews = ref<TagView[]>([]);
  const cachedViews = ref<string[]>([]);
  const router = useRouter();
  const route = useRoute();
  const leaveGuards = createViewLeaveGuardRegistry();
  const viewOperationLock = createViewOperationLock();

  function runViewOperation<T>(operation: () => T | Promise<T>) {
    return viewOperationLock.run(operation);
  }

  function registerLeaveGuard(
    fullPath: string,
    guard: () => boolean | Promise<boolean>,
    rollback?: () => void
  ) {
    return leaveGuards.register(fullPath, guard, rollback);
  }

  async function canRemoveViews(views: readonly TagView[]): Promise<boolean> {
    return leaveGuards.canRemove(views.map((view) => view.fullPath));
  }

  function rollbackRemoveViews(views: readonly TagView[]) {
    leaveGuards.rollback(views.map((view) => view.fullPath));
  }

  /**
   * 添加已访问视图到已访问视图列表中
   */
  function addVisitedView(view: TagView) {
    // 如果已经存在于已访问的视图列表中或者是重定向地址，则不再添加
    if (view.path.startsWith("/redirect") || isExternal(view.path) || isExternal(view.fullPath)) {
      return;
    }
    if (visitedViews.value.some((v) => v.path === view.path)) {
      return;
    }
    // 如果视图是固定的（affix），则在已访问的视图列表的开头添加
    if (view.affix) {
      visitedViews.value.unshift(view);
    } else {
      // 如果视图不是固定的，则在已访问的视图列表的末尾添加
      visitedViews.value.push(view);
    }
  }

  /**
   * 添加缓存视图到缓存视图列表中
   */
  function addCachedView({ fullPath, keepAlive }: TagView) {
    // 如果缓存视图名称已经存在于缓存视图列表中，则不再添加
    if (cachedViews.value.includes(fullPath)) {
      return;
    }

    // 如果视图需要缓存（keepAlive），则将其路由名称添加到缓存视图列表中
    if (keepAlive) {
      cachedViews.value.push(fullPath);
    }
  }

  /**
   * 从已访问视图列表中删除指定的视图
   */
  function delVisitedView(view: TagView) {
    return new Promise((resolve) => {
      for (const [i, v] of visitedViews.value.entries()) {
        // 找到与指定视图路径匹配的视图，在已访问视图列表中删除该视图
        if (v.path === view.path) {
          visitedViews.value.splice(i, 1);
          break;
        }
      }
      resolve([...visitedViews.value]);
    });
  }

  function delCachedView(view: TagView) {
    const { fullPath } = view;
    return new Promise((resolve) => {
      const index = cachedViews.value.indexOf(fullPath);
      if (index > -1) {
        cachedViews.value.splice(index, 1);
      }
      resolve([...cachedViews.value]);
    });
  }
  function delOtherVisitedViews(view: TagView) {
    return new Promise((resolve) => {
      visitedViews.value = visitedViews.value.filter((v) => {
        return v?.affix || v.path === view.path;
      });
      resolve([...visitedViews.value]);
    });
  }

  function delOtherCachedViews(view: TagView) {
    const { fullPath } = view;
    return new Promise((resolve) => {
      const index = cachedViews.value.indexOf(fullPath);
      if (index > -1) {
        cachedViews.value = cachedViews.value.slice(index, index + 1);
      } else {
        // if index = -1, there is no cached tags
        cachedViews.value = [];
      }
      resolve([...cachedViews.value]);
    });
  }

  function updateVisitedView(view: TagView) {
    for (const v of visitedViews.value) {
      if (v.path === view.path) {
        Object.assign(v, view);
        break;
      }
    }
  }

  /**
   * 根据路径更新标签名称
   * @param fullPath 路径
   * @param title 标签名称
   */
  function updateTagName(fullPath: string, title: string) {
    const tag = visitedViews.value.find((tag: TagView) => tag.fullPath === fullPath);

    if (tag) {
      tag.title = title;
    }
  }

  function addView(view: TagView) {
    const existing = visitedViews.value.find((item) => item.path === view.path);

    if (!existing) {
      addVisitedView(view);
      addCachedView(view);
      return;
    }

    const previousFullPath = existing.fullPath;
    Object.assign(existing, view);

    if (previousFullPath !== view.fullPath || !view.keepAlive) {
      const previousCacheIndex = cachedViews.value.indexOf(previousFullPath);
      if (previousCacheIndex > -1) {
        cachedViews.value.splice(previousCacheIndex, 1);
      }
    }
    addCachedView(view);
  }

  function delView(view: TagView): Promise<TagsViewResult> {
    return new Promise((resolve) => {
      delVisitedView(view);
      delCachedView(view);
      resolve({
        visitedViews: [...visitedViews.value],
        cachedViews: [...cachedViews.value],
      });
    });
  }

  function delOtherViews(view: TagView): Promise<TagsViewResult> {
    return new Promise((resolve) => {
      delOtherVisitedViews(view);
      delOtherCachedViews(view);
      resolve({
        visitedViews: [...visitedViews.value],
        cachedViews: [...cachedViews.value],
      });
    });
  }

  function delLeftViews(view: TagView): Promise<DirectionalTagsViewResult> {
    return new Promise((resolve) => {
      const currIndex = visitedViews.value.findIndex((v) => v.path === view.path);
      if (currIndex === -1) {
        resolve({
          visitedViews: [...visitedViews.value],
        });
        return;
      }
      visitedViews.value = visitedViews.value.filter((item, index) => {
        if (index >= currIndex || item?.affix) {
          return true;
        }

        const cacheIndex = cachedViews.value.indexOf(item.fullPath);
        if (cacheIndex > -1) {
          cachedViews.value.splice(cacheIndex, 1);
        }
        return false;
      });
      resolve({
        visitedViews: [...visitedViews.value],
      });
    });
  }

  function delRightViews(view: TagView): Promise<DirectionalTagsViewResult> {
    return new Promise((resolve) => {
      const currIndex = visitedViews.value.findIndex((v) => v.path === view.path);
      if (currIndex === -1) {
        resolve({
          visitedViews: [...visitedViews.value],
        });
        return;
      }
      visitedViews.value = visitedViews.value.filter((item, index) => {
        if (index <= currIndex || item?.affix) {
          return true;
        }
        const cacheIndex = cachedViews.value.indexOf(item.fullPath);
        if (cacheIndex > -1) {
          cachedViews.value.splice(cacheIndex, 1);
        }
        return false;
      });
      resolve({
        visitedViews: [...visitedViews.value],
      });
    });
  }

  function delAllViews(): Promise<TagsViewResult> {
    return new Promise((resolve) => {
      const affixTags = visitedViews.value.filter((tag) => tag?.affix);
      visitedViews.value = affixTags;
      cachedViews.value = [];
      resolve({
        visitedViews: [...visitedViews.value],
        cachedViews: [...cachedViews.value],
      });
    });
  }

  function delAllVisitedViews() {
    return new Promise((resolve) => {
      const affixTags = visitedViews.value.filter((tag) => tag?.affix);
      visitedViews.value = affixTags;
      resolve([...visitedViews.value]);
    });
  }

  function delAllCachedViews() {
    return new Promise((resolve) => {
      cachedViews.value = [];
      resolve([...cachedViews.value]);
    });
  }

  /**
   * 退出当前用户会话时彻底清空标签与缓存。
   * 与“关闭所有标签”不同，这里不保留 affix 标签，避免跨用户复用上一个会话的页面实例。
   */
  function resetViews(): void {
    visitedViews.value = [];
    cachedViews.value = [];
    leaveGuards.clear();
  }

  /**
   * 关闭固定路径的标签并释放缓存；当前标签可指定返回地址，后台标签不改变当前路由。
   * 先执行已登记的离开守卫；拒绝或导航失败时保留标签，返回 false。
   * @param fullPath 创建页面时捕获的完整路径，不跟随异步操作中的全局路由变化。
   * @param fallbackPath 当前标签关闭后的目标路径；省略时返回最后一个标签或首页。
   */
  async function closeView(fullPath: string, fallbackPath?: string): Promise<boolean> {
    const result = await runViewOperation(async () => {
      const tag = visitedViews.value.find((view) => view.fullPath === fullPath);
      if (tag && !(await canRemoveViews([tag]))) return false;
      // 先去掉缓存资格；当前组件在成功离开时销毁，而不是继续进入 KeepAlive。
      if (tag) await delCachedView(tag);
      await nextTick();
      try {
        if (route.fullPath === fullPath) {
          const failure = fallbackPath
            ? await router.push(fallbackPath)
            : await toLastView(
                visitedViews.value.filter((view) => view !== tag),
                tag
              );
          if (failure) {
            if (tag) {
              addCachedView(tag);
              rollbackRemoveViews([tag]);
            }
            return false;
          }
        }
        if (tag) await delVisitedView(tag);
        return true;
      } catch (cause) {
        if (tag) {
          addCachedView(tag);
          rollbackRemoveViews([tag]);
        }
        throw cause;
      }
    });
    return result ?? false;
  }

  /** 关闭调用时的当前标签；异步确认后仍只关闭该实例。 */
  function closeCurrentView() {
    return closeView(route.fullPath);
  }

  function isActive(tag: TagView) {
    return tag.path === route.path;
  }

  function toLastView(visitedViews: TagView[], view?: TagView) {
    const latestView = visitedViews.slice(-1)[0];
    if (latestView && latestView.fullPath) {
      return router.push(latestView.fullPath);
    } else {
      // now the default is to redirect to the home page if there is no tags-view,
      // you can adjust it according to your needs.
      if (view?.name === "Dashboard") {
        // to reload home page
        return router.replace("/redirect" + view.fullPath);
      } else {
        return router.push("/");
      }
    }
  }

  return {
    visitedViews,
    cachedViews,
    addVisitedView,
    addCachedView,
    delVisitedView,
    delCachedView,
    delOtherVisitedViews,
    delOtherCachedViews,
    updateVisitedView,
    addView,
    delView,
    delOtherViews,
    delLeftViews,
    delRightViews,
    delAllViews,
    delAllVisitedViews,
    delAllCachedViews,
    resetViews,
    registerLeaveGuard,
    canRemoveViews,
    rollbackRemoveViews,
    runViewOperation,
    closeView,
    closeCurrentView,
    isActive,
    toLastView,
    updateTagName,
  };
});

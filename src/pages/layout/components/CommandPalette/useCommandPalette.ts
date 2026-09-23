import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useEventListener } from "@vueuse/core";
import router from "@/router";
import { usePermissionStore, useUserStore } from "@/stores";
import { createUserDataKey, userDataStore } from "@/utils/user-data";
import { collectSearchItems, createMenuSearch, highlightTitle } from "./search";
import type { SearchItem } from "./search";

/** 当前账号的菜单搜索；权限更新时重建索引，历史经公共偏好存储隔离。
 * @remarks 不读旧版无账号归属的历史，不保存业务参数；存储不可用不阻断导航。
 * @example
 * `const palette = useCommandPalette()`
 */
export function useCommandPalette() {
  const permission = usePermissionStore();
  const user = useUserStore();
  const visible = ref(false);
  const keyword = ref("");
  const activeIndex = ref(0);
  const inputRef = ref<HTMLInputElement>();
  const historyPaths = ref<string[]>([]);
  const notice = ref("");
  const navigating = ref(false);
  let alive = true;
  let revision = 0;
  let historyRevision = 0;
  const items = computed(() => collectSearchItems(permission.routes));
  const search = computed(() => createMenuSearch(items.value));
  const results = computed(() => (keyword.value.trim() ? search.value(keyword.value) : []));
  const history = computed(() =>
    historyPaths.value.flatMap((path) => {
      const item = items.value.find((item) => item.path === path);
      return item ? [item] : [];
    })
  );
  const displayList = computed(() =>
    keyword.value.trim()
      ? results.value.map(({ item, matches }) => ({
          ...item,
          parts: highlightTitle(
            item.title,
            matches?.find((match) => match.key === "title")?.indices
          ),
        }))
      : (history.value.length ? history.value : items.value.slice(0, 8)).map((item) => ({
          ...item,
          parts: highlightTitle(item.title),
        }))
  );
  const sectionLabel = computed(() =>
    keyword.value.trim() ? "搜索结果" : history.value.length ? "最近访问" : "可用菜单"
  );
  const storageKey = computed(() => {
    const userId = user.userInfo.userId;
    return userId === undefined || userId === null
      ? null
      : createUserDataKey({
          kind: "preferences",
          userId,
          moduleKey: "layout.command-palette",
          slot: "history:v1",
        });
  });
  watch(
    storageKey,
    async (key) => {
      const run = ++revision;
      const initialRevision = ++historyRevision;
      historyPaths.value = [];
      notice.value = "";
      visible.value = false;
      if (!key) return;
      try {
        const result = await userDataStore.read<unknown>(key);
        if (!alive || run !== revision || initialRevision !== historyRevision) return;
        const value = result.record?.schemaVersion === 1 ? result.record.value : null;
        if (Array.isArray(value))
          historyPaths.value = [
            ...new Set(value.filter((path): path is string => typeof path === "string")),
          ].slice(0, 8);
        if (result.level === "memory") notice.value = "历史仅在本次运行保留";
      } catch {
        if (alive && run === revision) notice.value = "历史暂不可读取，不影响搜索";
      }
    },
    { immediate: true }
  );
  watch(displayList, () => {
    activeIndex.value = 0;
  });

  function open() {
    if (visible.value) return;
    keyword.value = "";
    activeIndex.value = 0;
    visible.value = true;
  }
  function close() {
    visible.value = false;
  }
  async function focusInput() {
    await nextTick();
    inputRef.value?.focus();
  }
  async function persist(paths: string[]) {
    const key = storageKey.value;
    const run = revision;
    historyRevision++;
    historyPaths.value = paths;
    if (!key) return;
    try {
      const result = await userDataStore.write(key, paths, {
        schemaVersion: 1,
        ttlMs: 365 * 86400000,
      });
      if (alive && run === revision)
        notice.value = result.level === "memory" ? "历史仅在本次运行保留" : "";
    } catch {
      if (alive && run === revision) notice.value = "历史未能保存，不影响搜索";
    }
  }
  async function onGo(item: SearchItem) {
    const current = items.value.find((entry) => entry.path === item.path);
    if (!current || navigating.value) return;
    const run = revision;
    navigating.value = true;
    close();
    try {
      const failure = await router.push({ path: current.path, query: current.query });
      if (alive && run === revision && !failure)
        await persist(
          [current.path, ...historyPaths.value.filter((path) => path !== current.path)].slice(0, 8)
        );
    } catch {
      if (alive && run === revision) {
        notice.value = "页面暂时无法打开，请重试";
        visible.value = true;
      }
    } finally {
      navigating.value = false;
    }
  }
  function onSelect() {
    const item = displayList.value[activeIndex.value];
    if (item) void onGo(item);
  }
  function onNavigate(direction: "up" | "down") {
    const count = displayList.value.length;
    if (count)
      activeIndex.value = (activeIndex.value + (direction === "up" ? -1 : 1) + count) % count;
  }
  useEventListener(document, "keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.repeat ||
      event.altKey ||
      event.shiftKey
    )
      return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      open();
    }
  });
  onBeforeUnmount(() => {
    alive = false;
    revision++;
  });
  return {
    visible,
    keyword,
    activeIndex,
    inputRef,
    displayList,
    sectionLabel,
    notice,
    navigating,
    open,
    close,
    focusInput,
    onSelect,
    onNavigate,
    onGo,
    clearHistory: () => persist([]),
  };
}

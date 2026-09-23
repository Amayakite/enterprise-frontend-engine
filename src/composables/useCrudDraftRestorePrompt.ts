import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CrudDraftController } from "./useCrudDraft";

/**
 * 发现可恢复草稿时，显示指向草稿提示条的操作引导。
 *
 * 同一轮可恢复状态只自动展示一次；KeepAlive 激活不会重复打断用户。草稿离开 available
 * 状态后重置提示标记，下次发现可恢复草稿可再次提示。恢复和丢弃仍由原草稿控制器处理。
 */
export function useCrudDraftRestorePrompt(draft: CrudDraftController | undefined) {
  /** 提示目标 DOM 是否已经挂载，未挂载时不自动打开引导。 */
  let mounted = false;
  /** 实例是否仍存在，等待 nextTick 后再次检查以免显示失效浮层。 */
  let alive = true;
  /** 本轮 available 状态是否已经自动提示；离开该状态后重置。 */
  let prompted = false;
  /** 草稿恢复引导浮层是否显示，与草稿数据本身分开管理。 */
  const visible = ref(false);

  /** 草稿可恢复时等待提示条渲染完成再显示引导；状态已变化则返回 false。 */
  async function show() {
    if (!alive || !draft || draft.state.phase !== "available") return false;
    // 等草稿提示条完成条件渲染后再取目标，避免 Tour 退化成无目标居中浮层。
    await nextTick();
    if (!alive || draft.state.phase !== "available") return false;
    visible.value = true;
    return true;
  }
  /** 只关闭引导浮层，不恢复、丢弃或修改草稿。 */
  function close() {
    visible.value = false;
  }

  /** 当前可恢复状态只自动提示一次，手动关闭后不立即再次打扰。 */
  function showOnce() {
    if (!mounted || prompted || draft?.state.phase !== "available") return;
    prompted = true;
    void show();
  }

  /** 提示目标挂载后检查是否已经有可恢复草稿。 */
  onMounted(() => {
    mounted = true;
    showOnce();
  });
  /** 草稿变为可恢复时提示；处理完成或状态变化后关闭并重置提示标记。 */
  watch(
    () => draft?.state.phase,
    (phase) => {
      if (phase === "available") showOnce();
      else {
        prompted = false;
        close();
      }
    }
  );
  /** 卸载时关闭引导并阻止等待中的 show 再次打开它。 */
  onBeforeUnmount(() => {
    alive = false;
    close();
  });

  return { visible, show, close };
}

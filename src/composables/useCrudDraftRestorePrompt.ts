import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CrudDraftController } from "./useCrudDraft";

/**
 * 统一处理“发现可恢复草稿”时的首次漫游式聚焦引导。
 *
 * 每个编辑页实例只自动展示一次；KeepAlive 激活不会重复打断用户。具体的恢复/丢弃
 * 仍由调用方使用既有 draft controller，避免引导层承载业务数据操作。
 */
export function useCrudDraftRestorePrompt(draft: CrudDraftController | undefined) {
  let mounted = false;
  let alive = true;
  let prompted = false;
  const visible = ref(false);

  async function show() {
    if (!alive || !draft || draft.state.phase !== "available") return false;
    // 等草稿提示条完成条件渲染后再取目标，避免 Tour 退化成无目标居中浮层。
    await nextTick();
    if (!alive || draft.state.phase !== "available") return false;
    visible.value = true;
    return true;
  }
  function close() {
    visible.value = false;
  }

  function showOnce() {
    if (!mounted || prompted || draft?.state.phase !== "available") return;
    prompted = true;
    void show();
  }

  onMounted(() => {
    mounted = true;
    showOnce();
  });
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
  onBeforeUnmount(() => {
    alive = false;
    close();
  });

  return { visible, show, close };
}

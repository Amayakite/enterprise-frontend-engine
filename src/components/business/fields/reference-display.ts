import { shallowRef, type InjectionKey } from "vue";
import { createReferenceValidationBatch } from "./validation";

/** 创建当前展示宿主的参照回显上下文；合并同源同范围请求，随宿主释放，不是长期字典缓存。 */
export function createReferenceDisplayContext() {
  let controller = new AbortController();
  let batch = createReferenceValidationBatch();
  const revision = shallowRef(0);
  return {
    revision,
    get batch() {
      return batch;
    },
    get signal() {
      return controller.signal;
    },
    reset() {
      controller.abort();
      controller = new AbortController();
      batch = createReferenceValidationBatch();
      revision.value++;
    },
    dispose() {
      controller.abort();
    },
  };
}
/** 参照显示请求的共享上下文；生命周期由当前展示宿主管理。 */
export type ReferenceDisplayContext = ReturnType<typeof createReferenceDisplayContext>;
export const referenceDisplayKey: InjectionKey<ReferenceDisplayContext> =
  Symbol("table-reference-display");

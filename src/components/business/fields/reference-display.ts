import { shallowRef, type InjectionKey } from "vue";
import { createReferenceValidationBatch } from "./validation";

/** 创建当前展示调用方的参照回显上下文；合并同源同范围请求，随调用方释放，不是长期字典缓存。 */
export function createReferenceDisplayContext() {
  /** 共享参照回显当前使用的取消信号，切换范围或释放时取消整批请求。 */
  let controller = new AbortController();
  /** 当前范围的参照解析批次，把多个单元格相同来源的 ID 查询合并。 */
  let batch = createReferenceValidationBatch();
  /** 共享参照显示的刷新版本，清空当前批次后递增，通知使用者重新加载名称。 */
  const revision = shallowRef(0);
  return {
    revision,
    /** 提供当前批量解析器，同一轮相同来源的名称查询共用它。 */
    get batch() {
      return batch;
    },
    /** 提供当前请求取消信号，范围改变后返回新信号。 */
    get signal() {
      return controller.signal;
    },
    /** 切页或换组织时取消旧请求、建立新批次，并通知所有名称显示重新加载。 */
    reset() {
      controller.abort();
      controller = new AbortController();
      batch = createReferenceValidationBatch();
      revision.value++;
    },
    /** 容器卸载时取消整批请求，不再创建新的批次或触发刷新。 */
    dispose() {
      controller.abort();
    },
  };
}
/** 参照显示请求的共享上下文；生命周期由当前展示调用方管理。 */
export type ReferenceDisplayContext = ReturnType<typeof createReferenceDisplayContext>;
/** 表格向内部参照显示提供共享请求环境的注入键，独立参照也可以自己创建环境。 */
export const referenceDisplayKey: InjectionKey<ReferenceDisplayContext> =
  Symbol("table-reference-display");

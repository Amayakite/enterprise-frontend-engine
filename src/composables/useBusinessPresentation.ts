import { defineAsyncComponent, markRaw, shallowRef, h, onScopeDispose } from "vue";
import type {
  BusinessContainerEditorOptions,
  BusinessPresentation,
  EditorLeavePort,
  PresentedEditor,
} from "@/components/business/crud/presentation";
import { createBusinessPaths } from "@/components/business/crud/page";

/**
 * 非路由表单容器状态；只保留当前实例，关闭后释放。
 * @remarks 全部关闭入口通过表单 canLeave，保存后只关闭、不重复保存；不读取组件私有 ref。
 */
export function useBusinessPresentation(basePath: string, title: string): BusinessPresentation {
  const current = shallowRef<PresentedEditor | null>(null);
  const paths = createBusinessPaths(basePath);
  let port: EditorLeavePort | undefined;
  let closing: Promise<void> | undefined;
  let alive = true;
  onScopeDispose(() => {
    alive = false;
    port = undefined;
    current.value = null;
  });
  const canLeave = () => port?.canLeave() ?? Promise.resolve(true);
  const close = () => {
    if (closing) return closing;
    closing = (async () => {
      if (await canLeave()) {
        current.value = null;
        port = undefined;
      }
    })().finally(() => {
      closing = undefined;
    });
    return closing;
  };
  return {
    get current() {
      return current.value;
    },
    canLeave,
    close,
    cancelLeaveApproval: () => port?.cancelLeaveApproval(),
    async open(target, options: BusinessContainerEditorOptions) {
      if (!options.component)
        throw new Error("dialog/drawer 模式必须配置 component 懒加载当前 add/edit 页面");
      if (current.value) {
        await close();
        if (current.value) return;
      }
      if (!alive) return;
      const instanceKey = target.mode === "add" ? paths.add : paths.edit(target.id);
      current.value = {
        mode: options.mode,
        title: `${target.mode === "add" ? "新增" : "编辑"}${title}`,
        width: options.width ?? "min(1100px, 94vw)",
        component: markRaw(
          defineAsyncComponent({
            loader: options.component,
            errorComponent: {
              render: () => h("p", { role: "alert" }, "页面加载失败，请关闭后重试。"),
            },
            loadingComponent: { render: () => h("p", { role: "status" }, "正在加载编辑页面…") },
          })
        ),
        context: {
          target,
          instanceKey,
          close,
          saved: async () => {
            current.value = null;
            port = undefined;
          },
          register(value) {
            port = value;
            return () => {
              if (port === value) port = undefined;
            };
          },
        },
      };
    },
  };
}

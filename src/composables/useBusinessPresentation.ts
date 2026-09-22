import { defineAsyncComponent, defineComponent, markRaw, shallowRef, h, onScopeDispose } from "vue";
import type {
  BusinessContainerEditorOptions,
  BusinessEditorLoader,
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
  let opening = false;
  let revision = 0;
  const ports = new Set<EditorLeavePort>();
  let closing: Promise<void> | undefined;
  let alive = true;
  onScopeDispose(() => {
    alive = false;
    ports.clear();
    current.value = null;
  });
  const cancelLeaveApproval = () => {
    for (const port of ports) port.cancelLeaveApproval();
  };
  const canLeave = async () => {
    for (const port of ports) {
      if (!(await port.canLeave())) {
        cancelLeaveApproval();
        return false;
      }
    }
    return true;
  };
  const close = () => {
    if (closing) return closing;
    closing = (async () => {
      const editor = current.value;
      if (await canLeave()) {
        if (current.value !== editor) return;
        await editor?.context.onClosed?.();
        if (current.value === editor) {
          current.value = null;
          ports.clear();
        }
      }
    })().finally(() => {
      closing = undefined;
    });
    return closing;
  };
  const presentation: BusinessPresentation = {
    get current() {
      return current.value;
    },
    canLeave,
    close,
    cancelLeaveApproval,
    async open(target, options: BusinessContainerEditorOptions) {
      if (!options.component)
        throw new Error("dialog/drawer 模式必须配置 component 懒加载当前 add/edit 页面");
      if (opening) return false;
      opening = true;
      try {
        const previous = current.value;
        let loader: BusinessEditorLoader = options.component;
        if (previous) {
          try {
            // 新场景加载成功才替换旧页；下载失败保留旧页与输入。
            const loaded = await options.component();
            loader = async () => loaded;
          } catch (error) {
            cancelLeaveApproval();
            throw error;
          }
          if (!alive || current.value !== previous) return false;
          if (!(await canLeave())) return false;
          if (!alive || current.value !== previous) return false;
        }
        if (!alive) return false;
        ports.clear();
        const paths = createBusinessPaths(options.basePath ?? basePath);
        const instanceKey = target.mode === "add" ? paths.add : paths[target.mode](target.id);
        const editor: PresentedEditor = {
          key: ++revision,
          mode: options.mode,
          title: `${target.mode === "add" ? "新增" : target.mode === "edit" ? "编辑" : "详情"}${options.title ?? title}`,
          width:
            options.width ?? (options.mode === "drawer" ? "min(720px, 96vw)" : "min(1100px, 96vw)"),
          component: markRaw(
            defineComponent({
              setup() {
                function createPage() {
                  return defineAsyncComponent({
                    loader,
                    loadingComponent: { render: () => h("p", { role: "status" }, "正在加载页面…") },
                    errorComponent: {
                      render: () =>
                        h("div", { role: "alert" }, [
                          h("p", "页面加载失败，已保留来源页面。"),
                          h(
                            "button",
                            {
                              type: "button",
                              onClick: () => {
                                page.value = createPage();
                              },
                            },
                            "重新加载"
                          ),
                        ]),
                    },
                  });
                }
                const page = shallowRef(createPage());
                return () => h(page.value);
              },
            })
          ),
          context: {
            onClosed: options.onClosed,
            target,
            mode: options.mode,
            depth: options.depth ?? 1,
            presentation,
            instanceKey,
            close: async () => {
              if (current.value === editor) await close();
            },
            saved: async (id) => {
              if (!alive || current.value !== editor) return;
              await options.onSaved?.(id);
              if (!alive || current.value !== editor) return;
              await options.onClosed?.();
              if (alive && current.value === editor) {
                current.value = null;
                ports.clear();
              }
            },
            register(value) {
              if (current.value !== editor) return () => {};
              ports.add(value);
              return () => {
                ports.delete(value);
              };
            },
          },
        };
        current.value = editor;
        return true;
      } finally {
        opening = false;
      }
    },
  };
  return presentation;
}

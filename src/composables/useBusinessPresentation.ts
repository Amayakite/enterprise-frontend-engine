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
 * 管理业务弹窗或抽屉里打开的新增、编辑和详情页面；关闭后释放当前实例。
 * @remarks 全部关闭入口通过表单 canLeave，保存后只关闭、不重复保存；不读取组件私有 ref。
 */
export function useBusinessPresentation(basePath: string, title: string): BusinessPresentation {
  /** 当前容器中展示的页面；null 表示没有打开弹窗或抽屉。 */
  const current = shallowRef<PresentedEditor | null>(null);
  /** 打开流程锁，防止组件下载或离开确认期间重复创建页面。 */
  let opening = false;
  /** 每次打开递增，作为组件 key，确保不同打开操作不会复用旧表单状态。 */
  let revision = 0;
  /** 当前容器内登记的离开检查方法，包括编辑表单和嵌套容器。 */
  const ports = new Set<EditorLeavePort>();
  /** 正在等待的关闭流程，多次点击关闭共用同一个 Promise。 */
  let closing: Promise<void> | undefined;
  /** 宿主是否仍存在，异步组件下载结束后据此判断能否挂载。 */
  let alive = true;
  /** 宿主销毁时释放页面和离开检查引用，阻止后续异步打开。 */
  onScopeDispose(() => {
    alive = false;
    ports.clear();
    current.value = null;
  });
  /** 撤回所有子页面已通过的离开许可，供打开失败或其他页面拒绝时使用。 */
  const cancelLeaveApproval = () => {
    for (const port of ports) port.cancelLeaveApproval();
  };
  /** 逐个询问已登记页面；任一个拒绝，就撤回本轮已有许可并返回 false。 */
  const canLeave = async () => {
    for (const port of ports) {
      if (!(await port.canLeave())) {
        cancelLeaveApproval();
        return false;
      }
    }
    return true;
  };
  /** 通过离开检查后执行关闭回调并释放当前页面；等待期间已换页则不关闭新页面。 */
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
  /** 供页面宿主使用的打开、关闭和离开检查入口。 */
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
        // 旧页面确认可离开后才解除它的登记并构造新页面，下载失败时仍保留旧输入。
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
                /** 创建可重试的异步页面组件，下载失败时显示局部错误和重新加载按钮。 */
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
                /** 当前异步组件包装；点击重试时重新创建，重新触发页面下载。 */
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
            // 保存完成先通知来源，再关闭容器；回调失败则保留页面，避免静默丢失反馈。
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

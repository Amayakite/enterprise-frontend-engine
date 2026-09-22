import { ElAlert } from "element-plus";
import "element-plus/es/components/alert/style/css";
import { h } from "vue";
import type { Slots, Slot, VNode } from "vue";
import { lazyCrudView } from "@/components/business/crud/lazy-view";
import type { BusinessModuleContract } from "@/components/business/crud/module";
import type {
  CrudPageModule,
  CrudListPageOptions,
  CrudFormPageOptions,
  CrudDetailPageOptions,
  CrudListPage,
  CrudFormPage,
  CrudDetailPage,
} from "@/components/business/crud/crud-page";
import type ListComponent from "@/components/business/crud/MyCrudList.vue";
import type FormComponent from "@/components/business/crud/MyCrudForm.vue";
import type DetailComponent from "@/components/business/crud/MyCrudDetail.vue";
import { useCrudRuntime } from "./useCrudRuntime";

/**
 * 兼容自动渲染入口：将共享装配的 bindings 渲染为列表/表单/详情，不重复装配控制器。
 * @param module defineBusinessModule 返回的模块；context/parseId 显式适配身份。
 * @param options 固定 view、可选辅助状态工厂及页面专属 hooks。
 * @returns 按 view 收窄的页面端口；state 可编辑，控制器 state 只读。
 * @remarks 钩子追加到公共流程；仅创建当前场景控制器，页面卸载由各控制器取消请求。
 * @example
 * `const page = useCrudPage(customerModule, { view: "add", state: () => ({ hint: "" }) });`
 */
export function useCrudPage<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(module: CrudPageModule<T>, options: CrudListPageOptions<T, S>): CrudListPage<T, S>;
export function useCrudPage<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(module: CrudPageModule<T>, options: CrudFormPageOptions<T, S, "add">): CrudFormPage<T, S>;
export function useCrudPage<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(module: CrudPageModule<T>, options: CrudFormPageOptions<T, S, "edit">): CrudFormPage<T, S>;
export function useCrudPage<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(module: CrudPageModule<T>, options: CrudDetailPageOptions<T, S>): CrudDetailPage<T, S>;
export function useCrudPage<
  T extends BusinessModuleContract,
  S extends object = Record<string, never>,
>(
  module: CrudPageModule<T>,
  options:
    | CrudListPageOptions<T, S>
    | CrudFormPageOptions<T, S, "add">
    | CrudFormPageOptions<T, S, "edit">
    | CrudDetailPageOptions<T, S>
): CrudListPage<T, S> | CrudFormPage<T, S> | CrudDetailPage<T, S> {
  function frame(slots: Slots, content: VNode, notice?: string) {
    return h("div", { class: "page-container crud-page" }, [
      notice ? h(ElAlert, { title: notice, type: "info", closable: false }) : null,
      slots["before-content"]?.(),
      content,
      slots["after-content"]?.(),
    ]);
  }
  function contentSlots(slots: Slots): Record<string, Slot | undefined> {
    const { "before-content": _before, "after-content": _after, ...content } = slots;
    return content;
  }
  if (options.view === "list") {
    const source = useCrudRuntime(module, options);
    const View = lazyCrudView<
      Parameters<
        typeof ListComponent<T["Model"], T["Id"], T["Schema"], T["Scope"], T["Query"], T["Context"]>
      >[0]
    >(() => import("@/components/business/crud/MyCrudList.vue"));
    return Object.assign(source, {
      render: (slots: Slots) =>
        frame(slots, h(View, source.bindings.list, contentSlots(slots)), source.notice),
    });
  }
  if (options.view === "detail") {
    const source = useCrudRuntime(module, options);
    const View = lazyCrudView<
      Parameters<typeof DetailComponent<T["Model"], T["Entity"], T["Id"], T["Context"]>>[0]
    >(() => import("@/components/business/crud/MyCrudDetail.vue"));
    return Object.assign(source, {
      render(slots: Slots) {
        if (source.invalidReason)
          return frame(slots, h("p", { role: "alert" }, source.invalidReason), source.notice);
        const forwarded = contentSlots(slots);
        for (const [key, view] of source.childViews())
          forwarded[`tab-${key}`] = () => [view.render(slots[`tab-${key}`])];
        return frame(slots, h(View, source.bindings.detail, forwarded), source.notice);
      },
    });
  }
  const source =
    options.view === "add" ? useCrudRuntime(module, options) : useCrudRuntime(module, options);
  const View = lazyCrudView<
    Parameters<typeof FormComponent<T["Model"], T["Entity"], T["Id"], T["Context"]>>[0]
  >(() => import("@/components/business/crud/MyCrudForm.vue"));
  return Object.assign(source, {
    render(slots: Slots) {
      if (source.invalidReason)
        return frame(
          slots,
          h("p", { role: options.view === "add" ? "status" : "alert" }, source.invalidReason),
          source.notice
        );
      const forwarded = contentSlots(slots);
      for (const [key, view] of source.childViews())
        forwarded[`section-${key}`] = () => [view.render(slots[`section-${key}`])];
      return frame(slots, h(View, source.bindings.form, forwarded), source.notice);
    },
  });
}

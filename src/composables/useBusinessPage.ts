import { computed, inject, hasInjectionContext } from "vue";
import { embeddedEditorKey } from "@/components/business/crud/presentation";
import { useBusinessPresentation } from "./useBusinessPresentation";
import { useRoute, useRouter } from "vue-router";
import { useTagsViewStore } from "@/stores/tags-view";
import { useUserStore } from "@/stores/user";
import { createAccessScopeKey } from "@/utils/identity";
import { createBusinessPaths } from "@/components/business/crud/page";
import type {
  BusinessPageOptions,
  BusinessNavigationOverrides,
} from "@/components/business/crud/page";

/**
 * 标准页面共用的上下文/身份/导航装配，不替代列表、表单和详情控制器。
 * @param module 模块配置，提供 meta.key 与 page；不传 page 会明确报错。
 * @param overrides 仅替换有业务差异的导航方法，例如 saved。
 * @returns 响应式 context/preference 与实例固定 entityId/instanceKey、导航、草稿身份。
 * @remarks 首次调用捕获 route.params.id/fullPath；后台 KeepAlive 页不会跟随全局路由加载其他实体。
 * @example
 * `const page = useBusinessPage(customerModule, { saved: async id => { await router.replace(customPath(id)); } });`
 */
export function useBusinessPage<Organization extends string>(
  module: {
    /** 稳定模块身份，与失效通知、列偏好和草稿保持一致。 */
    meta: {
      /** 可读且不随路由重构改变的 key；例如 customer。 */
      key: string;
      /** 容器标题使用模块名，省略使用 key。 */
      title?: string;
    };
    /** 标准路由页必填；纯配置模块可省略，但不能调用本 hook。 */
    page?: BusinessPageOptions<Organization>;
  },
  overrides: BusinessNavigationOverrides = {}
) {
  if (!module.page) throw new Error(`${module.meta.key}：请在 config.page 声明路由和组织来源`);
  const options = module.page;
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const tags = useTagsViewStore();
  const paths = createBusinessPaths(options.basePath);
  const embedded = hasInjectionContext() ? inject(embeddedEditorKey, undefined) : undefined;
  const presentation = useBusinessPresentation(
    options.basePath,
    module.meta.title ?? module.meta.key
  );
  const entityId = embedded
    ? embedded.target.mode === "edit"
      ? embedded.target.id
      : null
    : typeof route.params.id === "string"
      ? route.params.id
      : null;
  const instanceKey = embedded?.instanceKey ?? route.fullPath;
  const userId = computed(() => user.userInfo.userId ?? "session");
  const context = computed(() => {
    const organizationId =
      typeof options.organizationId === "function"
        ? options.organizationId()
        : options.organizationId;
    return {
      organizationId,
      scopeKey: createAccessScopeKey(
        module.meta.key,
        organizationId,
        userId.value,
        user.userInfo.perms
      ),
    };
  });
  const navigation = {
    /** 打开新增页；不预建模型或请求接口。 */
    add: async () => {
      const add = options.add;
      if (add?.mode === "dialog" || add?.mode === "drawer")
        await presentation.open({ mode: "add" }, add);
      else await router.push(paths.add);
    },
    /** 打开指定 ID 的编辑页；不复用其他标签的控制器。 */
    edit: async (id: string) => {
      const edit = options.edit;
      if (edit?.mode === "dialog" || edit?.mode === "drawer")
        await presentation.open({ mode: "edit", id }, edit);
      else await router.push(paths.edit(id));
    },
    /** 打开指定 ID 的详情页。 */
    detail: async (id: string) => {
      await router.push(paths.detail(id));
    },
    /** 保存完成后替换到详情页；可通过 overrides.saved 替换。 */
    saved: async (id: string) => {
      if (embedded) await embedded.saved(id);
      else await router.replace(paths.detail(id));
    },
    /** 关闭固定页面标签及缓存后返回列表；嵌入编辑器只关闭所属容器。 */
    close: async () => {
      if (embedded) await embedded.close();
      else if (!(await tags.closeView(instanceKey, paths.list)))
        throw new Error("页面未关闭，请重试");
    },
    ...overrides,
  };
  const preference = computed(() => ({
    user: String(userId.value),
    module: module.meta.key,
    scope: context.value.scopeKey,
    version: options.preferenceVersion ?? "1",
  }));
  const draftIdentity = () => ({
    userId: userId.value,
    tenantId: context.value.organizationId,
    instanceKey,
  });
  return {
    /** 传给 MyBusinessPageHost，仅非 tab 时加载表单。 */
    presentation,
    /** 响应式组织与用户/权限范围；传给 CRUD 控制器 context getter。 */
    context,
    /** 默认导航加业务覆写；只创建路由动作，不执行自动导航。 */
    navigation,
    /** 列偏好身份；可直接绑定 MyCrudList.preference。 */
    preference,
    /** 草稿身份 getter；传 useCrudForm，复用公共存储。 */
    draftIdentity,
    /** 创建本页面时的实体 ID；新增为 null，不跟随全局路由。 */
    entityId,
    /** 当前路由实例 fullPath；区分 KeepAlive 中不同实体页面。 */
    instanceKey,
    /** 表单/详情栅格列数，默认 3。 */
    columns: options.columns ?? 3,
    /** 配置的提示文案；省略时页面不显示提示栏。 */
    notice: options.notice,
  };
}

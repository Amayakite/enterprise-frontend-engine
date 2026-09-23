import { useBusinessOpen } from "./useBusinessOpen";
import { getBusinessCompletion, releaseBusinessCompletion } from "@/router/business-completion";
import { computed, inject, hasInjectionContext, provide, onScopeDispose } from "vue";
import {
  embeddedEditorKey,
  businessPresentationKey,
} from "@/components/business/crud/presentation";
import { useBusinessPresentation } from "./useBusinessPresentation";
import { useRoute, useRouter } from "vue-router";
import { useTagsViewStore } from "@/stores/tags-view";
import { useUserStore } from "@/stores/user";
import { createAccessScopeKey } from "@/utils/identity";
import { createBusinessPaths, resolveBusinessPresentation } from "@/components/business/crud/page";
import type {
  BusinessPageOptions,
  BusinessNavigationOverrides,
} from "@/components/business/crud/page";

/**
 * 标准页面共用的上下文/身份/导航组合，不替代列表、表单和详情控制器。
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
  /** 模块 page 配置，提供路由、组织来源、布局和展示方式。 */
  const options = module.page;
  /** 用于创建时捕获本页身份；实体 ID 和实例 key 不随全局路由持续变化。 */
  const route = useRoute();
  /** 用于解析稳定的草稿地址，移除临时跨页回调参数。 */
  const router = useRouter();
  /** 当前用户资料及权限，参与页面数据和本机偏好的隔离。 */
  const user = useUserStore();
  /** 页面标签管理；关闭本页时一并处理缓存和返回地址。 */
  const tags = useTagsViewStore();
  /** 由模块 basePath 生成列表、新增、编辑和详情地址。 */
  const paths = createBusinessPaths(options.basePath);
  /** 弹窗或抽屉提供的页面信息；路由页没有此值。 */
  const embedded = hasInjectionContext() ? inject(embeddedEditorKey, undefined) : undefined;
  /** 本页面可承载的业务弹窗/抽屉，传给 MyBusinessPageHost 使用。 */
  const presentation = useBusinessPresentation(
    options.basePath,
    options.layout?.entityLabel ?? module.meta.title ?? module.meta.key
  );
  if (embedded) onScopeDispose(embedded.register(presentation));
  /** 创建本实例时固定的记录 ID；新增为 null，优先从所属容器读取。 */
  const entityId = embedded
    ? embedded.target.mode !== "add"
      ? embedded.target.id
      : null
    : typeof route.params.id === "string"
      ? route.params.id
      : null;
  /** 本页面或容器的固定实例标识，用于关闭正确的标签及缓存。 */
  const instanceKey = embedded?.instanceKey ?? route.fullPath;
  /** 移除一次性返回来源的会话参数，让同一新增页重开时仍能找到原草稿。 */
  const { businessSession: _session, ...draftQuery } = route.query;
  /** 不含临时回调参数的实例地址，用来区分不同新增表单的本机草稿。 */
  const draftInstanceKey =
    embedded?.instanceKey ??
    router.resolve({ path: route.path, query: draftQuery, hash: route.hash }).fullPath;
  /** 当前用户 ID；尚未取得资料时使用 session 作为临时隔离值。 */
  const userId = computed(() => user.userInfo.userId ?? "session");
  /** 当前组织及由模块、账号、权限组成的范围 key，供数据查询和偏好隔离使用。 */
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
  provide(businessPresentationKey, presentation);
  /** 共用页面打开入口，分别用于本模块和已登记的其他模块。 */
  const { openPage, openBusiness } = useBusinessOpen(presentation);
  /** 当前模块的导航目标说明，统一打开逻辑据此选择路由页、弹窗或抽屉。 */
  const target = {
    key: module.meta.key,
    title: options.layout?.entityLabel ?? module.meta.title ?? module.meta.key,
    ...paths,
    page: options,
    matches: (path: string) => path.startsWith(`${paths.list}/`),
  };
  /** 跨页新增时的临时返回回调标识；嵌入页面直接使用容器回调。 */
  const completionToken = embedded ? undefined : route.query.businessSession;
  onScopeDispose(() => releaseBusinessCompletion(completionToken));
  /** 当前模块的新增、编辑、详情、保存后和关闭导航；最后应用页面自定义覆盖。 */
  const navigation = {
    /** 按统一配置打开新增。 */
    add: async () => {
      await openPage(target, { target: target.key, view: "add" });
    },
    /** 按统一配置打开编辑；嵌入详情切换时复用所属容器。 */
    edit: async (id: string) => {
      await openPage(target, { target: target.key, view: "edit", id });
    },
    /** 详情与新增/编辑使用相同展示解析。 */
    detail: async (id: string) => {
      await openPage(target, { target: target.key, view: "detail", id });
    },
    /** 保存完成后替换到详情页；可通过 overrides.saved 替换。 */
    saved: async (id: string) => {
      if (embedded) await embedded.saved(id);
      else {
        const completion = getBusinessCompletion(completionToken);
        // 从其他页面发起的新增优先回写并返回来源；普通新增才按模块设置打开详情。
        if (completion) {
          await completion.saved?.(id);
          if (!(await tags.closeView(instanceKey, completion.source)))
            throw new Error("返回来源失败，请重试");
          releaseBusinessCompletion(completionToken);
        } else {
          if (resolveBusinessPresentation(options, "detail").mode === "tab") {
            if (!(await tags.closeView(instanceKey, paths.detail(id))))
              throw new Error("打开详情失败，请重试");
          } else {
            const opened = await openPage(target, {
              target: target.key,
              view: "detail",
              id,
              onClosed: async () => {
                if (!(await tags.closeView(instanceKey, paths.list)))
                  throw new Error("页面未关闭，请重试");
              },
            });
            if (!opened) throw new Error("详情未打开，请重试");
          }
        }
      }
    },
    /** 关闭固定页面标签及缓存后返回列表；嵌入编辑器只关闭所属容器。 */
    close: async () => {
      if (embedded) await embedded.close();
      else if (
        !(await tags.closeView(
          instanceKey,
          getBusinessCompletion(completionToken)?.source ?? paths.list
        ))
      )
        throw new Error("页面未关闭，请重试");
      if (!embedded) releaseBusinessCompletion(completionToken);
    },
    ...overrides,
  };
  /** 列设置与查询方案使用的用户、模块、范围和版本身份。 */
  const preference = computed(() => ({
    user: String(userId.value),
    module: module.meta.key,
    scope: context.value.scopeKey,
    version: options.preferenceVersion ?? "1",
  }));
  /** 为当前表单提供用户、组织和新增实例身份，供本机草稿生成存储键。 */
  const draftIdentity = () => ({
    userId: userId.value,
    tenantId: context.value.organizationId,
    instanceKey: draftInstanceKey,
  });
  return {
    /** 传给 MyBusinessPageHost，仅非 tab 时加载表单。 */
    presentation,
    /** 跨模块统一打开入口，遵循目标模块展示策略。 */
    openBusiness,
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
    columns:
      embedded?.mode === "drawer"
        ? (1 as const)
        : (options.columns ?? (options.layout?.preset === "simple" ? 2 : 3)),
    /** 模块显式选择的内容布局；未配置保持兼容。 */
    layout: options.layout,
    /** 用户可读的实体称呼，不影响模块身份。 */
    entityLabel: options.layout?.entityLabel ?? module.meta.title ?? "",
    /** 配置的提示文案；省略时页面不显示提示栏。 */
    notice: options.notice,
  };
}

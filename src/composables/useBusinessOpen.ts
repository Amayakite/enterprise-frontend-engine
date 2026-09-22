import { inject, onScopeDispose } from "vue";
import { routerKey, routeLocationKey, isNavigationFailure } from "vue-router";
import {
  businessPresentationKey,
  embeddedEditorKey,
} from "@/components/business/crud/presentation";
import type {
  BusinessPresentation,
  BusinessView,
  BusinessPresentationMode,
} from "@/components/business/crud/presentation";
import { createBusinessPaths, resolveBusinessPresentation } from "@/components/business/crud/page";
import { getBusinessTarget } from "@/router/business-targets";
import type { BusinessTarget } from "@/router/business-targets";
import { registerBusinessCompletion } from "@/router/business-completion";

/** 统一页面打开请求；只传身份和展示意图，不预建目标模型。 */
export interface BusinessOpenRequest {
  /** 容器结束后的收尾，默认无；主要供已保存路由表单释放原标签，抛错保留容器。 */
  onClosed?: () => Promise<void>;
  /** 已登记业务目标，例如 sale。 */
  target: string;
  /** 新增、编辑或详情场景。 */
  view: BusinessView;
  /** 编辑/详情必填；数字 0 有效，在路由边界编码。 */
  id?: string | number;
  /** 单次展示覆盖；省略继承目标模块。 */
  mode?: BusinessPresentationMode;
  /** 保存后返回来源；省略时路由新增转详情、容器保存关闭。 */
  completion?: "return-to-source";
  /** 保存 ID 的局部回写；来源存活时调用，须自行 resolve 并验证可选性，不能再次保存目标。 */
  onSaved?: (id: string) => Promise<void>;
}

/** 所有业务入口共用的打开策略；按需挂载，超过两层容器转路由页。
 * @param host 来源页的宿主；省略从标准 CRUD 页面注入。
 * @returns openBusiness 供跨模块调用，openPage 供当前模块内部使用。
 * @remarks 不绕过路由可达性；表单和详情仍执行自身业务权限检查。来源卸载后不再回写。
 * @example
 * `await openBusiness({ target: "sale", view: "add" });`
 */
export function useBusinessOpen(host?: BusinessPresentation) {
  const router = inject(routerKey, undefined);
  const route = inject(routeLocationKey, undefined);
  const source = route?.fullPath ?? "";
  const injectedHost = inject(businessPresentationKey, undefined);
  const embedded = inject(embeddedEditorKey, undefined);
  const presentation = host ?? injectedHost;
  const disposers = new Set<() => void>();
  let alive = true;
  let opening = false;
  onScopeDispose(() => {
    alive = false;
    for (const dispose of disposers) dispose();
  });
  async function openPage(target: BusinessTarget, request: BusinessOpenRequest, replace = false) {
    if (opening || !alive) return false;
    if (!router || !route) throw new Error("当前宿主没有配置页面导航");
    if (request.view !== "add" && request.id === undefined) throw new Error("打开页面缺少记录 ID");
    if (!target.page) throw new Error("目标模块未登记页面展示配置");
    opening = true;
    try {
      const paths = createBusinessPaths(target.page.basePath);
      const path = request.view === "add" ? paths.add : paths[request.view](request.id!);
      if (!router.resolve(path).matched.length) throw new Error("当前账号无法访问目标页面");
      const options = resolveBusinessPresentation(target.page, request.view, {
        mode: request.mode,
      });
      const sameModule =
        embedded &&
        embedded.target.mode !== "add" &&
        request.view !== "add" &&
        embedded.target.id === String(request.id) &&
        embedded.instanceKey.startsWith(`${target.page.basePath}/`);
      const owner = sameModule ? embedded.presentation : presentation;
      const depth = sameModule ? embedded.depth : (embedded?.depth ?? 0) + 1;
      const onSaved = async (id: string) => {
        if (alive) await request.onSaved?.(id);
      };
      if (options.mode !== "tab" && depth <= 2) {
        if (!owner) throw new Error("当前页面未挂载业务页面宿主");
        if (!options.component) throw new Error("目标页面缺少 components 懒加载配置");
        return await owner.open(
          request.view === "add" ? { mode: "add" } : { mode: request.view, id: String(request.id) },
          {
            mode: options.mode,
            width: options.width,
            component: options.component,
            basePath: target.page.basePath,
            title: target.title,
            depth,
            onSaved,
            onClosed: request.onClosed ?? (sameModule ? embedded.onClosed : undefined),
          }
        );
      }
      if (sameModule && !(await embedded.presentation.canLeave())) return false;
      const session =
        request.completion === "return-to-source"
          ? registerBusinessCompletion({ source, saved: onSaved })
          : undefined;
      if (session) disposers.add(session.dispose);
      try {
        const destination = {
          path,
          query: session ? { businessSession: session.token } : undefined,
        };
        const failure = await (replace ? router.replace(destination) : router.push(destination));
        if (isNavigationFailure(failure)) {
          session?.dispose();
          if (sameModule) embedded.presentation.cancelLeaveApproval();
          return false;
        }
        if (sameModule) await embedded.close();
        return true;
      } catch (error) {
        session?.dispose();
        if (sameModule) embedded.presentation.cancelLeaveApproval();
        throw error;
      }
    } finally {
      opening = false;
    }
  }
  async function openBusiness(request: BusinessOpenRequest) {
    const target = getBusinessTarget(request.target);
    if (!target) throw new Error("目标页面未配置");
    return openPage(target, request);
  }
  return { openBusiness, openPage };
}

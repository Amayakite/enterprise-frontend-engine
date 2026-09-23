import { ref } from "vue";
import { useUserStore } from "@/stores/user";
import { ROLE_ROOT } from "@/config/constants";
/** 开发环境当前权限模拟模式，不代表服务端真实授权结果。 */
const mode = ref("normal");
/** 首次模拟前保存用户 ID、角色和权限，恢复正常模式时还原。 */
let original: { userId: string | undefined; roles: string[]; perms: string[] } | undefined;
/** 记录本工具上次应用的权限集合，避免把其他途径更新的权限误当作自己的状态。 */
let appliedPerms: string[] | undefined;
/** 仅开发预览组件调用；只在当前会话收紧权限，不写存储、不扩张登录授权。 */
export function useReferencePermissionPreview() {
  /** 当前用户状态，开发预览通过它临时切换前端权限表现。 */
  const user = useUserStore();
  /** 切换前端权限模拟并保留可恢复的原状态，只用于开发页面演示。 */
  function change(value: string) {
    if (!import.meta.env.DEV || !["normal", "sale", "customer"].includes(value)) return;
    if (
      !original ||
      original.userId !== user.userInfo.userId ||
      user.userInfo.perms !== appliedPerms
    ) {
      original = {
        userId: user.userInfo.userId,
        roles: [...(user.userInfo.roles ?? [])],
        perms: [...(user.userInfo.perms ?? [])],
      };
    }
    user.userInfo.roles =
      value === "normal"
        ? [...original.roles]
        : original.roles.filter((role) => role !== ROLE_ROOT);
    user.userInfo.perms =
      value === "normal"
        ? [...original.perms]
        : original.perms.filter((perm) => perm !== "base:" + value + ":create");
    appliedPerms = user.userInfo.perms;
    mode.value = value;
    if (value === "normal") {
      original = undefined;
      appliedPerms = undefined;
    }
  }
  return { mode, change };
}

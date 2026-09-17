import { ref } from "vue";
import { useUserStore } from "@/stores/user";
import { ROLE_ROOT } from "@/config/constants";
const mode = ref("normal");
let original: { userId: string | undefined; roles: string[]; perms: string[] } | undefined;
let appliedPerms: string[] | undefined;
/** 仅开发预览组件调用；只在当前会话收紧权限，不写存储、不扩张登录授权。 */
export function useReferencePermissionPreview() {
  const user = useUserStore();
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

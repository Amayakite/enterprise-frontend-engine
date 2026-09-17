import type { Directive, DirectiveBinding } from "vue";

import { useUserStore } from "@/stores";
import { ROLE_ROOT } from "@/config/constants";

/**
 * 按权限码控制元素是否保留在 DOM。
 *
 * @remarks 传入数组时采用“任一权限满足”语义。根角色以及 `*:*:*` 不做权限校验。
 * 无权限时会直接移除元素；它不是隐藏样式，也不会在当前挂载周期内自动恢复。
 * @example
 * ```vue
 * <el-button v-has-perm="'base:customer:create'">新增</el-button>
 * <el-button v-has-perm="['base:customer:update', 'base:customer:admin']">编辑</el-button>
 * ```
 */
export const hasPerm: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const requiredPerms = binding.value;

    // 校验传入的权限值是否合法
    if (!requiredPerms || (typeof requiredPerms !== "string" && !Array.isArray(requiredPerms))) {
      throw new Error(
        "需要提供权限标识！例如：v-has-perm=\"'sys:user:create'\" 或 v-has-perm=\"['sys:user:create', 'sys:user:update']\""
      );
    }

    const { roles, perms } = useUserStore().userInfo;

    // 超级管理员拥有所有权限，如果是"*:*:*"权限标识，则不需要进行权限校验
    if (roles.includes(ROLE_ROOT) || requiredPerms.includes("*:*:*")) {
      return;
    }

    // 检查权限
    const hasAuth = Array.isArray(requiredPerms)
      ? requiredPerms.some((perm) => perms.includes(perm))
      : perms.includes(requiredPerms);

    // 如果没有权限，移除该元素
    if (!hasAuth && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  },
};

/**
 * 按角色标识控制元素是否保留在 DOM。
 *
 * @remarks 传入数组时采用“任一角色满足”语义。无权限时直接移除元素，适用于不应暴露的
 * 页面操作；仅需禁用时请使用组件的 disabled/disabledReason，而非此指令。
 * @example
 * ```vue
 * <el-button v-has-role="'ADMIN'">系统设置</el-button>
 * <el-button v-has-role="['ADMIN', 'AUDITOR']">审批记录</el-button>
 * ```
 */
export const hasRole: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const requiredRoles = binding.value;

    // 校验传入的角色值是否合法
    if (!requiredRoles || (typeof requiredRoles !== "string" && !Array.isArray(requiredRoles))) {
      throw new Error(
        "需要提供角色标识！例如：v-has-role=\"'ADMIN'\" 或 v-has-role=\"['ADMIN', 'TEST']\""
      );
    }

    const { roles } = useUserStore().userInfo;

    // 检查是否有对应角色权限
    const hasAuth = Array.isArray(requiredRoles)
      ? requiredRoles.some((role) => roles.includes(role))
      : roles.includes(requiredRoles);

    // 如果没有权限，移除元素
    if (!hasAuth && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  },
};

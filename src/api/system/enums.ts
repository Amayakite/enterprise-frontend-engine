/**
 * 业务相关枚举
 *
 * @description
 * 包含菜单、用户、角色等业务实体的枚举定义
 */

/**
 * 菜单类型枚举
 */
export enum MenuTypeEnum {
  CATALOG = "C", // 目录
  MENU = "M", // 菜单
  EXTERNAL = "E", // 外链
  BUTTON = "B", // 按钮
}

/**
 * 用户性别枚举
 */
export enum UserGender {
  /** 未知 */
  UNKNOWN = 0,
  /** 男 */
  MALE = 1,
  /** 女 */
  FEMALE = 2,
}

/** 系统实体启停状态 */
export enum CommonStatus {
  /** 禁用 */
  DISABLED = 0,
  /** 启用 */
  ENABLED = 1,
}

/** 审核状态约定 */
export enum AuditStatus {
  /** 待审核 */
  PENDING = 0,
  /** 已通过 */
  APPROVED = 1,
  /** 已拒绝 */
  REJECTED = 2,
}

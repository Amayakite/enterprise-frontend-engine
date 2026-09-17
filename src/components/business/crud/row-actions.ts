import type { CrudAction, CrudRowActionContext } from "./types";

type RowAction<Row, Id extends string | number, C> = Extract<
  CrudAction<Row, Id, C>,
  {
    /**
     * 动作位置判别值；row 接收当前行，toolbar 接收工具栏选择集合。
     */
    location: "row";
  }
>;

/**
 * 常见单行命令。标签写在动作旁，不单独维护 label 字典。
 * @remarks 请求失败交给 useCrudActions；不吞错误，不自行重复提交。
 */
export interface RowCommand<Row, Id extends string | number, C> extends Omit<
  RowAction<Row, Id, C>,
  "location" | "execute" | "confirm"
> {
  /**
   * 执行单行写入；只处理请求，成功后的 affectedKeys/message 由工厂补齐。
   * @example
   * `request: ({ rowKey, row, signal }) => API.approve(rowKey, row.version, signal)`
   */
  request: (context: CrudRowActionContext<Row, Id, C>) => Promise<unknown>;
  /**
   * 默认确认文案为“确定{label}「{行名称}」吗？”；false 关闭确认，函数自定义。
   * @example
   * `confirm: ({ row }) => ({ title: "删除客户", message: "将同时删除联系人与地址，是否继续？" })`
   */
  confirm?: false | RowAction<Row, Id, C>["confirm"];
  /** 成功提示；省略时为“{实体名}已{label}”，空字符串表示不提示。 */
  successMessage?: string;
  /**
   * 自定义完整执行回执时覆盖此项；此时不调用 request，也不自动补 affectedKeys。
   * @example
   * `execute: async context => ({ affectedKeys: [context.rowKey], message: "处理完成" })`
   */
  execute?: RowAction<Row, Id, C>["execute"];
}

/** 共用的单行命令文案与权限约定；不把客户审核条件硬编码进公共层。 */
export interface RowCommandOptions<Row, Id extends string | number, C> {
  /** 确认标题及默认成功提示中的实体名，例如“客户”；不是缓存身份。 */
  entityLabel: string;
  /**
   * 默认权限前缀，动作权限为 `${permissionPrefix}:${key}`；省略则不自动加权限。
   * 单项 permission 优先。此项不是后端鉴权替代品。
   * @example
   * `permissionPrefix: "base:customer"`
   */
  permissionPrefix?: string;
  /** 确认框内的行显示名称，不作为 ID 使用。 */
  getLabel: (row: CrudRowActionContext<Row, Id, C>["row"]) => string;
  /** 动作配置数组；顺序即界面顺序，重复或空 key 会报错。 */
  items: readonly RowCommand<Row, Id, C>[];
}

/**
 * 将单行命令配置编译为既有 CrudAction，不新增执行器。
 * @returns 可直接作为列表或详情 actions 使用的配置数组。
 * @remarks 复用 useCrudActions 的权限、确认、单飞、错误与刷新生命周期；支持逐项覆盖。
 * @example
 * `const actions = defineRowCommands<Row, string, Context>()({ entityLabel: "客户", getLabel: row => row.name, items: [...] });`
 */
export function defineRowCommands<Row, Id extends string | number, C>() {
  return (options: RowCommandOptions<Row, Id, C>): readonly RowAction<Row, Id, C>[] => {
    const keys = options.items.map((item) => item.key);
    if (keys.some((key) => !key.trim()) || new Set(keys).size !== keys.length)
      throw new Error("行命令 key 为空或重复");
    return options.items.map(({ request, successMessage, confirm, execute, ...item }) => ({
      ...item,
      location: "row",
      permission:
        item.permission ??
        (options.permissionPrefix ? `${options.permissionPrefix}:${item.key}` : undefined),
      confirm:
        confirm === false
          ? undefined
          : (confirm ??
            (({ row }) => ({
              title: `${item.label}${options.entityLabel}`,
              message: `确定${item.label}「${options.getLabel(row)}」吗？`,
            }))),
      execute:
        execute ??
        (async (context) => {
          await request(context);
          return {
            affectedKeys: [context.rowKey],
            message: successMessage ?? `${options.entityLabel}已${item.label}`,
          };
        }),
    }));
  };
}

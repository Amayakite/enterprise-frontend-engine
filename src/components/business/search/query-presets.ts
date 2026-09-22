import { applyQueryDraft, checkQuerySort, createQueryDraft, parseQueryWhere } from "./model";
import type { AppliedQuery, QueryCondition, QueryNode, QuerySchema } from "./types";
import type { TableSort } from "@/components/table/types";

/** 本机查询方案配置；显式开启，不保存分页、勾选行或固定权限范围。 */
export interface QueryPresetOptions {
  /** 方案语义版本；查询字段含义变化时递增，旧方案保留并提示不可应用。
   * @example
   * `queryPresets: { version: 1 }`
   */
  version: number;
}

/** 已应用查询快照；只允许经当前 schema 和排序白名单校验的值。 */
export interface QueryPresetSnapshot<Row, S extends QuerySchema> {
  /** 快捷、普通、高级条件；空集合表示明确保存的无筛选查询。 */
  query: AppliedQuery<S>;
  /** 列表排序；null 表示不排序。 */
  sort: TableSort<Row> | null;
}

/** 方案元数据；无效方案仍可重命名或删除。 */
export interface QueryPresetItem {
  /** 本机生成的稳定方案 ID，与业务实体 ID 无关。 */
  id: string;
  /** 用户命名，去首尾空格后 1–40 字，同一范围内不可重名。 */
  name: string;
  /** 失效原因；空字符串表示当前可用。 */
  issue: string;
}

/** 列表查询方案端口；动作自行呈现错误，不修改业务数据。 */
export interface QueryPresetController {
  /** 当前范围内的方案；最多 20 个，按创建顺序展示。 */
  readonly items: readonly QueryPresetItem[];
  /** 默认方案 ID；null 表示使用模块初始查询。 */
  readonly defaultId: string | null;
  /** 当前应用的方案；手动改变条件或排序后清空。 */
  readonly activeId: string | null;
  /** 正在读取、写入或应用；为 true 时禁用方案操作。 */
  readonly busy: boolean;
  /** 最近操作错误；空字符串表示无错误，可通过 reload 重试读取。 */
  readonly error: string;
  /** 本机存储/内存降级说明，不表示服务器同步成功。 */
  readonly notice: string;
  /** 保存当前已应用条件和排序；name 为名称，成功返回 true，不触发查询。 */
  save: (name: string) => Promise<boolean>;
  /** 按 ID 应用条件及排序并回到第一页；失败返回 false，不移除无效条件。 */
  apply: (id: string) => Promise<boolean>;
  /** 重命名指定方案；只变名称，成功返回 true。 */
  rename: (id: string, name: string) => Promise<boolean>;
  /** 删除指定方案；删除默认项同时取消默认，不重查当前列表。 */
  remove: (id: string) => Promise<boolean>;
  /** 设置下次进入该范围时应用的默认方案；null 取消默认，不立即查询。 */
  setDefault: (id: string | null) => Promise<boolean>;
  /** 重读本机方案以解决并发冲突；不覆盖当前已应用查询。 */
  reload: () => Promise<void>;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** 校验不可信快照；字段、操作符、值、排序发生不兼容时抛错，禁止静默放宽查询。
 * @param value 从本机存储读取的未知快照。
 * @param schema 当前模块查询白名单。
 * @param sortKeys 当前允许排序的字段。
 * @returns 校验后的独立查询对象；不发请求、不写存储。
 * @example
 * `parseQueryPreset(saved, schema, ["name"])`
 */
export function parseQueryPreset<Row, S extends QuerySchema>(
  value: unknown,
  schema: S,
  sortKeys: readonly Extract<keyof Row, string>[]
): QueryPresetSnapshot<Row, S> {
  if (!record(value) || !record(value.query)) throw new Error("查询方案结构不正确");
  const input = value.query;
  const conditions = (nodes: unknown): QueryCondition<S>[] => {
    if (!Array.isArray(nodes)) throw new Error("查询条件结构不正确");
    if (!nodes.length) return [];
    const parsed = parseQueryWhere(schema, {
      kind: "group",
      id: "preset",
      operator: "and",
      children: nodes,
    });
    if (!parsed.valid) throw new Error(parsed.issues.map((item) => item.message).join("；"));
    const children: readonly QueryNode<S>[] = parsed.where?.children ?? [];
    const result = children.filter<QueryCondition<S>>(
      (node): node is QueryCondition<S> => node.kind === "condition"
    );
    if (result.length !== nodes.length) throw new Error("普通条件中不能包含分组");
    return result;
  };
  const advanced = parseQueryWhere(schema, input.advanced);
  if (!advanced.valid) throw new Error(advanced.issues.map((item) => item.message).join("；"));
  const query: AppliedQuery<S> = {
    quick: conditions(input.quick),
    normal: conditions(input.normal),
    advanced: advanced.where,
  };
  // 合并后再次检查总条件数，避免分区各自通过却超出整个查询的上限。
  const all = [...query.quick, ...query.normal, ...(query.advanced ? [query.advanced] : [])];
  if (all.length) {
    const parsed = parseQueryWhere(schema, {
      kind: "group",
      id: "preset-all",
      operator: "and",
      children: all,
    });
    if (!parsed.valid) throw new Error(parsed.issues.map((item) => item.message).join("；"));
  }
  const validated = applyQueryDraft(schema, createQueryDraft(schema, query));
  if (!validated.valid) throw new Error(validated.issues.map((item) => item.message).join("；"));
  return { query: validated.applied, sort: checkQuerySort(value.sort, sortKeys) };
}

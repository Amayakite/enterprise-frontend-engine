import { createReferenceField } from "@/components/business/fields/reference";
import type {
  ReferenceFilters,
  ReferenceId,
  ReferenceSource,
  ReferenceValue,
} from "@/components/business/MyReference/types";
import type { QueryValueEditor } from "./types";

/** 复用现有参照工厂；只有未校验草稿到输入组件的边界需要恢复 ID 模型。 */
export function createQueryReference<
  Row,
  Id extends ReferenceId,
  F extends ReferenceFilters,
>(options: {
  /**
   * 参照数据源合同；提供稳定 key、行主键/名称、搜索和 ID 回显方法。创建对象本身不发请求。
   * @example
   * `source: provinceReference`
   */
  source: ReferenceSource<Row, Id, F>;

  /**
   * 返回查询参照的固定范围，不接收表单 model；确保与 source 的过滤合同一致。
   * @example
   * `filters: () => ({ organizationId: "org-a", level: "province", parentId: null })`
   */
  filters: () => NoInfer<F>;

  /**
   * 可选的额外范围 key；默认继承 QueryPanel 的 scopeKey。独立使用时必须提供此项。
   * @remarks 与面板范围合并而非替换，避免自定义范围绕过用户/组织隔离。
   */
  scopeKey?: () => string;
}): QueryValueEditor {
  const make = (multiple: boolean) =>
    createReferenceField<
      {
        /**
         * 当前字段/选项的值；必须与声明的模型类型一致，空值按当前类型使用 null 或空数组。
         */
        value: ReferenceValue<Id, boolean>;
      },
      string
    >()({
      source: options.source,
      multiple,
      filters: options.filters,
      scopeKey: ({ context }) => context,
    });
  const single = make(false),
    multiple = make(true);
  return {
    render: (props) => {
      const scope = [props.scopeKey, options.scopeKey?.()].filter(Boolean);
      if (!scope.length) throw new Error("查询参照缺少 QueryPanel 范围或自定义 scopeKey");
      const model = {
        value: (props.value ?? (props.multiple ? [] : null)) as ReferenceValue<Id, boolean>,
      };
      return (props.multiple ? multiple : single).render(
        model.value,
        { model, context: JSON.stringify(scope), mode: "add" },
        props.disabled,
        (value) => props.change(value)
      );
    },
  };
}

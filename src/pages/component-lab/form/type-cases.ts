import { defineFields, buildSearchFields } from "@/components/business/fields/normalize";
import { createReferenceField } from "@/components/business/fields/reference";
import type { FieldLink } from "@/components/business/fields/types";
import { customerSource } from "@/pages/component-lab/reference/references";
import type { FormLabModel, FormLabContext, FormLabQuery } from "./types";

// 仅编译，不由演示入口加载。删除任一 expect-error 应得到真实类型错误。
function typeCases() {
  defineFields<FormLabModel>()([
    // @ts-expect-error 字段 key 必须属于模型
    { key: "missing", label: "错误字段", type: "text" },
  ]);
  defineFields<FormLabModel>()([
    // @ts-expect-error string 字段不能使用数字输入
    { key: "title", label: "错误数字", type: "number" },
  ]);
  buildSearchFields<FormLabQuery>()([
    // @ts-expect-error Query 独立建模，不可使用编辑字段名
    { key: "customerId", label: "客户", type: "number", search: { operator: "eq" } },
  ]);
  const adapter = createReferenceField<FormLabModel, FormLabContext>()({
    source: customerSource,
    filters: ({ context }) => ({ organizationId: context.organizationId }),
    scopeKey: ({ context }) => context.organizationId,
    // @ts-expect-error 回填值必须对应目标模型字段类型
    map: () => ({ amount: "错误金额" }),
  });
  defineFields<FormLabModel, FormLabContext>()([
    // @ts-expect-error 数字 ID source 不可接到字符串 ID 字段
    { key: "contactId", label: "错误参照", type: "reference", reference: adapter },
  ]);
  const link: FieldLink<FormLabModel> = {
    watch: ["title"],
    writes: ["amount"],
    // @ts-expect-error 联动 patch 保留目标值类型
    apply: () => ({ amount: false }),
  };
  return link;
}
void typeCases;

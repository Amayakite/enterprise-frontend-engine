import { useCrudView } from "../../src/composables/useCrudView";
import type { CrudFormViewOptions } from "../../src/components/business/crud/crud-view";
import { customerModule } from "../../src/pages/base/customer/config";
import { customerReferences } from "../../src/pages/base/customer/references";
import type { CustomerContract } from "../../src/pages/base/customer/types";

const localProvince = customerReferences.province.withMap(({ items, value }, { context }) => {
  items[0]?.level satisfies "province" | "city" | "district" | undefined;
  value satisfies string | null;
  context.organizationId satisfies "org-a";
  return { provinceName: items[0]?.name.trim() ?? "" };
});

const edit = useCrudView(customerModule, {
  view: "edit",
  form: { references: { provinceId: localProvince } },
});

edit.bindings.form.fields satisfies object;

// @ts-expect-error withMap 必须接收新的同步回写函数
customerReferences.province.withMap();
// @ts-expect-error 回写只能写入 CustomerFormModel 的正确字段类型
customerReferences.province.withMap(() => ({ provinceName: 1 }));
const invalidMap: Parameters<typeof customerReferences.province.withMap>[0] = () => ({
  // @ts-expect-error 从公开 withMap 参数取得的回调仍须校验 Partial<CustomerFormModel>
  provinceName: 1,
});
void invalidMap;
const wrongValue: CrudFormViewOptions<CustomerContract, object, "edit"> = {
  view: "edit",
  form: {
    references: {
      // @ts-expect-error 字符串业务字段不能被 string|null 参照覆盖
      customerName: localProvince,
    },
  },
};
void wrongValue;
const wrongKey: CrudFormViewOptions<CustomerContract, object, "edit"> = {
  view: "edit",
  form: {
    references: {
      // @ts-expect-error 覆盖 key 必须是页面模型字段
      missingReference: localProvince,
    },
  },
};
void wrongKey;

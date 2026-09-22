import SaleAPI from "@/api/base/sale";
import { defineBusinessModule } from "@/components/business/crud/module";
import { defineBusinessModel } from "@/components/business/crud/model";
import { checkQuerySort } from "@/components/business/search/model";
import { salePage } from "./page";
import { classifyRequestSaveError } from "@/utils/request-error";
import type { SaleContract } from "./types";

/** 最简标准 CRUD：字段只定义一次，四个页面只选择 view。
 * @example
 * `useCrudView(saleModule, { view: "add" })`
 */
export const saleModule = defineBusinessModule<SaleContract>()({
  /** 稳定身份供缓存、草稿、刷新共用。 */
  meta: { key: "base.sale", title: "销售组织档案" },
  /** 直接采用公共组织与访问范围，不新增页面上下文字段。 */
  context: (base) => base,
  /** 路径集中登记；保留本页新增 drawer 配置，页面宿主统一处理。 */
  page: salePage,
  /** 字符串 ID 保持原值。 */
  parseId: (value) => value,
  /** 标准 API 适配，无页面请求代码。 */
  api: {
    list: (query, request) => SaleAPI.search(query, request.signal),
    detail: (id, request) => SaleAPI.detail(id, request.signal),
    create: (payload, request) => SaleAPI.create(payload, request.signal),
    update: (id, payload, request) => SaleAPI.update(id, payload, request.signal),
  },
  /** 默认模型工厂负责隔离副本；这里只说明初值、白名单和版本差异。 */
  model: defineBusinessModel<SaleContract>()({
    create: () => ({
      id: "",
      organizationId: "org-a",
      code: "",
      name: "",
      active: true,
      remark: "",
      version: 0,
    }),
    fromRecord: (row) => row,
    getKey: (row) => row.id,
    toPayload: (model) => ({
      code: model.code.trim(),
      name: model.name.trim(),
      active: model.active,
      remark: model.remark.trim(),
    }),
    updatePayload: (payload, input) => ({ ...payload, version: input.baseline.version }),
    resolveSaved: async (row) => row,
  }),
  /** 主字段内联：表单、列表、详情及搜索共用一套定义。 */
  fields: [
    {
      key: "code",
      label: "组织编码",
      type: "text",
      props: { maxlength: 30 },
      placeholder: "例如 SALE-HD",
      form: { required: true },
      scenes: {
        list: { width: 160, sortable: true },
        detail: true,
        query: { normal: true, advanced: true, keyword: true },
      },
    },
    {
      key: "name",
      label: "组织名称",
      type: "text",
      props: { maxlength: 80 },
      placeholder: "例如华东销售组织",
      form: { required: true },
      scenes: {
        list: { minWidth: 220, link: "detail", sortable: true },
        detail: true,
        query: { normal: true, advanced: true, keyword: true },
      },
    },
    {
      key: "active",
      label: "启用",
      type: "switch",
      form: {},
      scenes: {
        list: { width: 100 },
        detail: { format: (value) => (value ? "已启用" : "已停用") },
        query: { normal: true, advanced: true },
      },
    },
    {
      key: "remark",
      label: "备注",
      type: "textarea",
      props: { maxlength: 300 },
      form: { span: 2 },
      scenes: { detail: { span: 2 } },
    },
  ],
  /** 自动派生普通/高级/关键词查询，不复制 UI schema。 */
  query: { source: "fields" },
  /** 本模块没有子表，不添加空包装组件。 */
  children: {},
  /** 仅保留固定范围、排序、权限与草稿策略。 */
  views: {
    /** 摘要复用详情字段，正文只保留备注，不重复名称、编码和状态。 */
    detail: {
      summary: { titleField: "name", descriptionFields: ["code"], statusFields: ["active"] },
    },
    list: {
      getKey: (row) => row.id,
      scope: (context) => ({
        key: context.scopeKey,
        value: { organizationId: context.organizationId },
      }),
      toQuery: (query) => ({ ...query, sort: checkQuerySort(query.sort, ["code", "name"]) }),
      pageSize: 20,
    },
    form: {
      permissions: { create: "base:sale:create", update: "base:sale:update" },
      /** 仅确认的业务/权限拒绝可重提；网络或服务端不确定时保留结果未知保护。 */
      classifySaveError: classifyRequestSaveError,
      draft: {
        version: 1,
        fields: ["code", "name", "active", "remark"],
        getEntityVersion: (row) => row.version,
      },
    },
  },
});

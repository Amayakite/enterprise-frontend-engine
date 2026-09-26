import CompanyAPI from "@/api/base/company";
import { defineBusinessModule } from "@/components/business/crud/module";
import { defineBusinessModel } from "@/components/business/crud/model";
import { checkQuerySort } from "@/components/business/search/model";
import { companyPage } from "./page";
import { classifyRequestSaveError } from "@/utils/request-error";
import type { CompanyContract } from "./types";

/** 公司档案维护基础信息、联系人和一个位置，区域随主记录整单保存。
 * 字符串 ID、org-a 范围和版本来自开发 Mock，不包含随机分配公司或正式租户权限。
 * 标准 CRUD 管理校验/草稿/保存；地图通过 custom 字段插槽维护隔离草稿。
 * 位置可暂不填写；接口联调前不作为正式打卡边界。
 * @example
 * `useCrudView(companyModule, { view: "add" })`
 */
export const companyModule = defineBusinessModule<CompanyContract>()({
  /** 稳定身份供缓存、草稿、刷新共用。 */
  meta: { key: "base.company", title: "公司档案" },
  /** 直接采用公共组织与访问范围，不新增页面上下文字段。 */
  context: (base) => base,
  /** 路径集中登记；使用 tab 编辑避免嵌套业务容器，页面容器统一处理。 */
  page: companyPage,
  /** 字符串 ID 保持原值。 */
  parseId: (value) => value,
  /** 标准 API 适配，无页面请求代码。 */
  api: {
    list: (query, request) => CompanyAPI.search(query, request.signal),
    detail: (id, request) => CompanyAPI.detail(id, request.signal),
    create: (payload, request) => CompanyAPI.create(payload, request.signal),
    update: (id, payload, request) => CompanyAPI.update(id, payload, request.signal),
  },
  /** 默认模型工厂负责隔离副本；这里只说明初值、白名单和版本差异。 */
  model: defineBusinessModel<CompanyContract>()({
    create: () => ({
      id: "",
      organizationId: "org-a",
      code: "",
      name: "",
      active: true,
      remark: "",
      contactName: "",
      phone: "",
      location: null,
      contractTemplate: null,
      version: 0,
    }),
    fromRecord: (row) => ({ ...row, contractTemplate: row.contractTemplate ?? null }),
    getKey: (row) => row.id,
    toPayload: (model) => ({
      code: model.code.trim(),
      name: model.name.trim(),
      active: model.active,
      remark: model.remark.trim(),
      contactName: model.contactName.trim(),
      phone: model.phone.trim(),
      location: model.location,
      contractTemplate: model.contractTemplate
        ? { name: model.contractTemplate.name, url: model.contractTemplate.url }
        : null,
    }),
    updatePayload: (payload, input) => ({ ...payload, version: input.baseline.version }),
    resolveSaved: async (row) => row,
  }),
  /** 主字段内联：表单、列表、详情及搜索共用一套定义。 */
  fields: [
    {
      key: "code",
      label: "公司编码",
      type: "text",
      props: { maxlength: 30 },
      placeholder: "例如 COMP-001",
      form: { required: true },
      scenes: {
        list: { width: 160, sortable: true },
        detail: true,
        query: { normal: true, advanced: true, keyword: true },
      },
    },
    {
      key: "name",
      label: "公司名称",
      type: "text",
      props: { maxlength: 80 },
      placeholder: "例如示例医药有限公司",
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
      key: "contactName",
      label: "联系人",
      type: "text",
      props: { maxlength: 40 },
      form: {},
      scenes: { list: { width: 120 }, detail: true },
    },
    {
      key: "phone",
      label: "联系电话",
      type: "text",
      props: { maxlength: 40 },
      form: {},
      scenes: { list: { width: 160 }, detail: true },
    },
    {
      key: "remark",
      label: "备注",
      type: "textarea",
      props: { maxlength: 300 },
      form: { span: 2 },
      scenes: { detail: { span: 2 } },
    },
    {
      key: "location",
      label: "公司位置",
      type: "custom",
      form: { span: 2 },
      help: "可只选择点位；业务区域按需维护，保存时与公司资料一起提交。",
      scenes: {
        list: {
          minWidth: 260,
          format: (row) =>
            row.location
              ? `${row.location.place.name} · ${row.location.region ? "含区域" : "仅点位"}`
              : "待维护位置",
        },
      },
    },
    { key: "contractTemplate", label: "合同模板", type: "custom", form: { span: 2 }, scenes: {} },
  ],
  /** 自动派生普通/高级/关键词查询，不复制 UI schema。 */
  query: { source: "fields" },
  /** 本模块没有子表，不添加空包装组件。 */
  children: {},
  /** 仅保留固定范围、排序、权限与草稿策略。 */
  views: {
    /** 摘要复用详情字段，正文展示联系人及备注，位置使用详情页签。 */
    detail: {
      summary: { titleField: "name", descriptionFields: ["code"], statusFields: ["active"] },
    },
    list: {
      queryPresets: { version: 1 },
      getKey: (row) => row.id,
      scope: (context) => ({
        key: context.scopeKey,
        value: { organizationId: context.organizationId },
      }),
      toQuery: (query) => ({ ...query, sort: checkQuerySort(query.sort, ["code", "name"]) }),
      pageSize: 20,
    },
    form: {
      permissions: { create: "base:company:create", update: "base:company:update" },
      /** 仅确认的业务/权限拒绝可重提；网络或服务端不确定时保留结果未知保护。 */
      classifySaveError: classifyRequestSaveError,
      draft: {
        version: 1,
        fields: [
          "code",
          "name",
          "active",
          "remark",
          "contactName",
          "phone",
          "location",
          "contractTemplate",
        ],
        getEntityVersion: (row) => row.version,
      },
    },
  },
});

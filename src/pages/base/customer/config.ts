import CustomerAPI from "@/api/base/customer";
import { customerSortKeys, toCustomerSearchRequest } from "@/api/base/customer/query";
import { defineBusinessModule } from "@/components/business/crud/module";
import { checkQuerySort } from "@/components/business/search/model";
import { classifyRequestSaveError } from "@/utils/request-error";
import { createCustomerForm, toCustomerForm, toCustomerPayload } from "./adapters";
import type { CustomerContract, CustomerFormModel, CustomerPageContext } from "./types";
import type { CustomerSavePayload } from "@/api/base/customer/types";
import { defineBusinessModel } from "@/components/business/crud/model";
import { defineRowCommands } from "@/components/business/crud/row-actions";
import { defineAggregateBinding } from "@/components/business/crud/aggregate";
import { createReferenceField } from "@/components/business/fields/reference";
import { createQueryReference } from "@/components/business/search/reference";
import { createGeographyReference } from "@/api/master-data/reference";
import type { TableHeaderGroup } from "@/components/table/types";
import { customerContactsConfig } from "./children/contacts/config";
import { customerAddressesConfig } from "./children/addresses/config";
import { customerPage } from "./page";
import { customerReferences, customerProvinceSource } from "./references";
import { saleReference } from "@/pages/base/sale/references";

/** 本页用到的固定选项、分组表头和地区参照，不另拆文件。 */
const headers = {
  profile: { key: "profile", label: "客户资料", align: "center" },
  contact: { key: "contact", label: "区域与联系", align: "center" },
  management: { key: "management", label: "管理信息", align: "center" },
} as const satisfies Record<string, TableHeaderGroup>;

const reference = createReferenceField<CustomerFormModel, CustomerPageContext>();
// 这里只创建可复用数据源，不发请求；字段 reference.filters 决定省/市/区及父级范围。
const province = customerProvinceSource;
const city = createGeographyReference("城市");
const district = createGeographyReference("区县");

const bindChild = defineAggregateBinding<CustomerFormModel, CustomerSavePayload>();

/** 行动作只声明业务差异；公共工厂补权限、确认文案和成功回执。 */
const customerRowActions = defineRowCommands<CustomerFormModel, string, CustomerPageContext>()({
  entityLabel: "客户",
  permissionPrefix: "base:customer",
  getLabel: (row) => row.customerName,
  items: [
    {
      key: "approve",
      label: "审核",
      visible: ({ row }) => row.status === "pending",
      request: ({ rowKey, row, signal }) =>
        CustomerAPI.action(rowKey, "approve", row.version, signal),
    },
    {
      key: "revoke",
      label: "撤销审核",
      visible: ({ row }) => row.status === "approved",
      request: ({ rowKey, row, signal }) =>
        CustomerAPI.action(rowKey, "revoke", row.version, signal),
    },
    {
      key: "enable",
      label: "启用",
      visible: ({ row }) => !row.active,
      request: ({ rowKey, row, signal }) =>
        CustomerAPI.action(rowKey, "enable", row.version, signal),
    },
    {
      key: "disable",
      label: "停用",
      visible: ({ row }) => row.active,
      request: ({ rowKey, row, signal }) =>
        CustomerAPI.action(rowKey, "disable", row.version, signal),
    },
    {
      key: "delete",
      label: "删除",
      tone: "danger",
      disabledReason: ({ row }) =>
        row.status === "approved" ? "已审核客户需先撤销审核" : undefined,
      confirm: ({ row }) => ({
        title: "删除客户",
        message: `确定删除「${row.customerName}」吗？客户主档、联系人和收货地址将一并删除。`,
      }),
      request: ({ rowKey, row, signal }) => CustomerAPI.remove(rowKey, row.version, signal),
    },
  ],
});

/**
 * 客户模块唯一入口：身份 → 接口 → 模型 → 字段 → 查询 → 子表 → 页面策略。
 * @remarks 当前 create/update 适配开发 Mock 的整单保存；新后端 saveMasterDetail 就绪后在 API 层适配。
 * @example
 * `const config = customerModule.createRuntime(navigation, "edit");`
 */
export const customerModule = defineBusinessModule<CustomerContract>()({
  /** 1. 模块身份：保存/刷新/草稿共用稳定 key，不随目录调整更名。 */
  meta: { key: "customer", title: "客户管理", componentKey: "customer" },
  /** 页面身份显式适配；保持当前组织与稳定 scope，不涉及后端 token。 */
  context: (base) => {
    if (base.organizationId !== "org-a") throw new Error("客户示例仅配置 org-a 组织");
    return { ...base, organizationId: base.organizationId };
  },
  /** 客户 ID 为字符串；路由只在这里解析一次。 */
  parseId: (value) => value,
  /** 批量默认主键；改 batchCode 时同时提供 getValue: row => row.customerCode。 */
  batch: { field: "batchID" },
  /** 页面约定集中维护；各路由通过 useBusinessPage 获得导航、scope 和草稿身份。 */
  page: {
    ...customerPage,
    preferenceVersion: "3",
    notice: "当前使用开发进程内存 Mock；保存可读回，但重启服务后会恢复种子数据。",
  },
  /** 2. 接口适配：读取返回页面模型，写入仍走现有 Mock 整单协议。 */
  api: {
    list: async (query, request) => {
      const page = await CustomerAPI.search(query, request.signal);
      return { ...page, list: page.list.map(toCustomerForm) };
    },
    detail: (id, request) => CustomerAPI.getDetail(id, request.signal),
    create: (payload, request) => CustomerAPI.create(payload, request.signal),
    update: (id, payload, request) => {
      const { version, ...body } = payload;
      return CustomerAPI.update(id, body, version, request.signal);
    },
  },
  /** 3. 模型流程：工厂处理副本与公共保存转换，业务仅提供白名单和版本差异。 */
  model: (children) =>
    defineBusinessModel<CustomerContract>()({
      create: createCustomerForm,
      fromRecord: toCustomerForm,
      getKey: (record) => record.id,
      toPayload: (model) => toCustomerPayload(model, children),
      updatePayload: (payload, input) => ({ ...payload, version: input.baseline.version }),
      resolveSaved: async (record) => record,
    }),
  /** 4. 唯一主字段列表：在这里直接维护控件、规则和场景差异。 */
  fields: [
    {
      key: "saleId",
      label: "销售组织",
      type: "reference",
      form: { group: "基本信息", required: true },
      placeholder: "选择销售组织",
      help: "选择后可查看组织档案；找不到时先调整搜索，也可前往新增。",
      reference: reference({
        source: saleReference,
        filters: ({ context }) => ({ organizationId: context.organizationId }),
        scopeKey: ({ context }) => context.scopeKey,
        map: ({ items }) => ({ saleName: items[0]?.name ?? "" }),
        /** 跳转由字段配置决定，source 只负责数据。 */
        navigation: {
          view: (id) => ({ target: "sale", id }),
          create: "sale",
          createdId: (id) => id,
          createLabel: "前往新增销售组织",
        },
      }),
      scenes: { detail: { group: "基本信息" } },
    },
    {
      key: "customerName",
      scenes: {
        list: {
          label: "客户名称 / 编号",
          minWidth: 238,
          sortable: true,
          link: "detail",
          secondary: "customerCode",
          headerGroup: headers.profile,
        },
        detail: true,
        /** 查询只声明入口；文本默认 contains，keyword 自动组合这些文本字段。 */
        query: { normal: true, advanced: true, keyword: true },
      },
      label: "客户名称",
      type: "text",
      form: { group: "基本信息", required: true, span: 2 },
      props: { placeholder: "请输入客户完整名称", maxlength: 100 },
    },
    {
      key: "shortName",
      scenes: { detail: true, query: { advanced: true, keyword: true } },
      label: "客户简称",
      type: "text",
      form: {},
      props: { placeholder: "便于日常识别", maxlength: 30 },
    },
    {
      key: "customerType",
      scenes: {
        list: { width: 112, headerGroup: headers.profile },
        detail: true,
        query: { normal: true, advanced: true },
      },
      label: "客户类型",
      type: "dict",
      dict: { code: "customer_type", valueType: "string" },
      emptyValue: "distributor",
      form: { required: true },
    },
    {
      key: "creditCode",
      scenes: { detail: { span: 3 }, query: { normal: true, advanced: true, keyword: true } },
      label: "统一社会信用代码",
      type: "text",
      help: "选填；填写时必须是 18 位大写字母或数字",
      formatHint: "统一社会信用代码",
      form: {
        span: 1,
        rules: { pattern: /^[A-Z0-9]{18}$/, message: "请输入 18 位大写字母或数字" },
      },
      props: { placeholder: "请输入 18 位统一社会信用代码", maxlength: 18 },
    },
    {
      key: "provinceId",
      scenes: {
        query: {
          normal: true,
          advanced: true,
          input: createQueryReference({
            source: province,
            filters: () =>
              ({ organizationId: "org-a", level: "province", parentId: null }) as const,
          }),
        },
      },
      label: "省份",
      type: "reference",
      form: { group: "区域与联系", required: true },
      reference: customerReferences.province,
    },
    {
      key: "cityId",
      scenes: { query: { advanced: true } },
      label: "城市",
      type: "reference",
      form: { required: true },
      reference: reference({
        source: city,
        /** 选择与清空时同步回填名称，供 change 钩子及未保存界面使用。 */
        map: ({ items }) => ({ cityName: items[0]?.name ?? "" }),
        filters: ({ context, model }) => ({
          organizationId: context.organizationId,
          level: "city" as const,
          parentId: model.provinceId,
        }),
        scopeKey: ({ context }) => context.scopeKey,
        beforeOpen: ({ model }) => ({ allowed: model.provinceId !== null, reason: "请先选择省份" }),
      }),
    },
    {
      key: "districtId",
      scenes: { query: { advanced: true } },
      label: "区县",
      type: "reference",
      form: { required: true },
      reference: reference({
        source: district,
        /** 选择与清空时同步回填名称，供 change 钩子及未保存界面使用。 */
        map: ({ items }) => ({ districtName: items[0]?.name ?? "" }),
        filters: ({ context, model }) => ({
          organizationId: context.organizationId,
          level: "district" as const,
          parentId: model.cityId,
        }),
        scopeKey: ({ context }) => context.scopeKey,
        beforeOpen: ({ model }) => ({ allowed: model.cityId !== null, reason: "请先选择城市" }),
      }),
    },
    {
      key: "address",
      scenes: { detail: { span: 2 } },
      label: "详细地址",
      type: "text",
      form: { span: 2, required: true },
      props: { placeholder: "街道、门牌号及楼层等信息", maxlength: 180 },
    },
    {
      key: "phone",
      scenes: { detail: true, query: { advanced: true, keyword: true } },
      label: "联系电话",
      type: "text",
      form: {},
      props: { placeholder: "手机号或固定电话", maxlength: 30 },
    },
    {
      key: "remark",
      scenes: { detail: { span: 3, group: "其他信息" } },
      label: "备注",
      type: "textarea",
      form: { group: "其他信息", span: 3 },
      props: { placeholder: "客户背景、合作说明或需要留意的事项", maxlength: 500, rows: 3 },
    },
    {
      key: "customerCode",
      label: "客户编号",
      type: "text",
      scenes: { detail: { order: 0.5 }, query: { normal: true, advanced: true, keyword: true } },
    },
    {
      key: "provinceName",
      label: "省份",
      type: "text",
      scenes: { detail: { order: 4.1, group: "区域与联系" } },
    },
    {
      key: "cityName",
      label: "城市",
      type: "text",
      scenes: {
        detail: { order: 4.2 },
        list: {
          order: 3,
          label: "所在地区",
          minWidth: 190,
          headerGroup: headers.contact,
          format: (row) =>
            [row.provinceName, row.cityName, row.districtName].filter(Boolean).join(" / "),
        },
      },
    },
    { key: "districtName", label: "区县", type: "text", scenes: { detail: { order: 4.3 } } },
    {
      key: "contacts",
      label: "主要联系人",
      type: "custom",
      scenes: {
        list: {
          order: 4,
          minWidth: 175,
          headerGroup: headers.contact,
          format: (row) => {
            const contact = row.contacts.find((item) => item.primary) ?? row.contacts[0];
            return contact ? `${contact.name} ${contact.phone}` : "—";
          },
        },
      },
    },
    {
      key: "status",
      label: "审核状态",
      type: "dict",
      dict: { code: "customer_status", valueType: "string" },
      emptyValue: "pending",
      scenes: {
        list: { width: 100, align: "center", headerGroup: headers.management },
        detail: { group: "状态与审计" },
        query: { normal: true, advanced: true },
      },
    },
    {
      key: "active",
      label: "启用状态",
      type: "switch",
      scenes: {
        list: { width: 92, align: "center", headerGroup: headers.management },
        detail: true,
        query: { normal: true, advanced: true },
      },
    },
    { key: "createdBy", label: "创建人", type: "text", scenes: { detail: true } },
    {
      key: "createdTime",
      label: "创建时间",
      type: "datetime",
      scenes: {
        list: { width: 165, sortable: true, headerGroup: headers.management },
        detail: true,
        query: { normal: true, advanced: true },
      },
    },
    { key: "updatedTime", label: "更新时间", type: "datetime", scenes: { detail: true } },
  ],
  /** 5. 地区联动：上级改变时清空下级，不复制表单状态。 */
  links: [
    {
      watch: ["provinceId"],
      writes: ["cityId", "cityName", "districtId", "districtName"],
      // 地区下级必须清为空，不恢复编辑页载入时的旧地区。
      apply: () => ({ cityId: null, cityName: "", districtId: null, districtName: "" }),
    },
    {
      watch: ["cityId"],
      writes: ["districtId", "districtName"],
      apply: () => ({ districtId: null, districtName: "" }),
    },
  ],
  /** 6. 查询由 fields 自动派生，关键词只存在于查询层；不重复维护 API schema。 */
  query: { source: "fields" },
  /** 7. 子表归属直接登记；具体行字段/校验仍留在各自 children/<name>/config.ts。 */
  children: {
    /** 联系人：表单 contacts 数组 → 整单 DTO.contacts。 */
    contacts: bindChild({
      modelKey: "contacts",
      payloadKey: "contacts",
      config: customerContactsConfig,
    }),
    /** 收货地址：表单 addresses 数组 → 整单 DTO.addresses。 */
    addresses: bindChild({
      modelKey: "addresses",
      payloadKey: "addresses",
      config: customerAddressesConfig,
    }),
  },
  /** 8. 页面策略：这里只放分页、权限、草稿和动作，不再重复定义字段。 */
  views: {
    /** 列表的固定范围、排序与行操作。 */
    list: {
      queryPresets: { version: 1 },
      getKey: (row) => row.id,
      scope: (context) => ({
        key: `${context.scopeKey}:customer`,
        value: { organizationId: context.organizationId },
      }),
      toQuery: (request) =>
        toCustomerSearchRequest({
          ...request,
          sort: checkQuerySort(request.sort, customerSortKeys),
        }),
      pageSize: 20,
      initialSort: { key: "createdTime", order: "desc" },
      selection: "multiple",
      editDisabledReason: (row) =>
        row.status === "approved" ? "已审核客户需先撤销审核" : undefined,
      actions: () => customerRowActions,
    },
    /** 新增/编辑共同策略；不同字段规则写 fields.scenes.add/edit。 */
    form: {
      draft: {
        version: 1,
        fields: [
          "saleId",
          "saleName",
          "customerName",
          "shortName",
          "customerType",
          "creditCode",
          "phone",
          "provinceId",
          "cityId",
          "districtId",
          "address",
          "remark",
        ],
        getEntityVersion: (entity) => entity.version,
      },
      permissions: { create: "base:customer:create", update: "base:customer:update" },

      readonlyReason: (model) =>
        model.status === "approved" ? "已审核客户需先撤销审核再编辑" : undefined,
      classifySaveError: classifyRequestSaveError,
      feedback: { saved: "客户资料已保存" },
    },
    /** 详情复用相同行命令；只有删除成功后需关闭当前详情，不能刷新已删除实体。 */
    detail: {
      summary: {
        titleField: "customerName",
        descriptionFields: ["customerCode"],
        statusFields: ["status"],
      },
      actions: (navigation) =>
        customerRowActions.map((action) =>
          action.key === "delete"
            ? {
                ...action,
                refresh: "none",
                afterExecute: async () => {
                  await navigation.close?.();
                },
              }
            : action
        ),
    },
  },
});

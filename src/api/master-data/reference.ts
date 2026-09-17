import request from "@/utils/request";
import type { ReferenceSource } from "@/components/business/MyReference/types";
import { createMasterDataApi } from "./index";
import type {
  AttendeeCandidate,
  AttendeeFilters,
  GeographyFilters,
  GeographyItem,
  InventoryFilters,
  InventoryItem,
  PartyFilters,
  PartyItem,
  ProjectFilters,
  ProjectItem,
  ServiceItem,
  ServiceItemFilters,
  ServiceTargetFilters,
  ServiceTargetItem,
} from "./types";
import type {
  RegionCascaderSource,
  RegionId,
  RegionOption,
} from "@/components/business/fields/types";

const unavailable = { allowed: false, reason: "该基础资料已停用" } as const;
const available = { allowed: true } as const;

export function createPartyReference(
  title: string
): ReferenceSource<PartyItem, string, PartyFilters> {
  const api = createMasterDataApi<PartyItem, string, PartyFilters>("parties", (row) => row.id);
  return {
    key: `party:${title}`,
    title,
    getKey: (row) => row.id,
    getLabel: (row) => row.name,
    getDescription: (row) => `${row.code} · ${row.groupName}`,
    columns: [
      { key: "code", label: "单位编码", width: 120, sortable: true },
      { key: "name", label: "单位名称", minWidth: 180, sortable: true },
      { key: "groupName", label: "所属集团", minWidth: 140 },
      { key: "organizationName", label: "组织", minWidth: 140 },
    ],
    searchFields: [
      { key: "code", label: "单位编码", type: "text", operator: "contains" },
      { key: "name", label: "单位名称", type: "text", operator: "contains" },
    ],
    ...api,
    selectable: (row) => (row.active ? available : unavailable),
  };
}

export const inventoryReference: ReferenceSource<InventoryItem, string, InventoryFilters> = (() => {
  const api = createMasterDataApi<InventoryItem, string, InventoryFilters>(
    "inventory",
    (row) => row.id
  );
  return {
    key: "inventory",
    title: "药品",
    getKey: (row) => row.id,
    getLabel: (row) => row.name,
    getDescription: (row) => `${row.code} · ${row.specification} · ${row.factoryName}`,
    columns: [
      { key: "code", label: "药品编码", width: 120, sortable: true },
      { key: "name", label: "药品名称", minWidth: 160, sortable: true },
      { key: "specification", label: "规格", width: 120 },
      { key: "factoryName", label: "生产厂家", minWidth: 160 },
    ],
    ...api,
    selectable: (row) => (row.active ? available : unavailable),
  };
})();

export const serviceItemReference: ReferenceSource<ServiceItem, string, ServiceItemFilters> =
  (() => {
    const api = createMasterDataApi<ServiceItem, string, ServiceItemFilters>(
      "service-items",
      (row) => row.id
    );
    return {
      key: "service-item",
      title: "服务项目",
      getKey: (row) => row.id,
      getLabel: (row) => row.name,
      getDescription: (row) => `${row.code} · ${row.category} · ${row.price} 元/${row.unit}`,
      columns: [
        { key: "code", label: "服务编码", width: 120, sortable: true },
        { key: "name", label: "服务名称", minWidth: 180, sortable: true },
        { key: "category", label: "类别", width: 120 },
        { key: "unit", label: "单位", width: 90 },
        { key: "price", label: "定价", width: 100, align: "right" },
      ],
      ...api,
      selectable: (row) => (row.active ? available : unavailable),
    };
  })();

/**
 * 创建省市区参照的数据源描述，不在创建时请求接口。
 * @param title 显示名称，例如省份、城市、区县；不是筛选条件。
 * @returns 包含列定义、search 和 resolve 方法的数据源，供 createReferenceField 使用。
 * @remarks 搜索/弹窗查询时才读取列表；回显与提交校验按 ID 调用 resolve。
 * 层级、父 ID 和组织由字段 filters 指定；API 适配留在 API 层，不内联到页面。
 * @example
 * `const province = createGeographyReference("省份");`
 */
export function createGeographyReference(
  title: string
): ReferenceSource<GeographyItem, string, GeographyFilters> {
  const api = createMasterDataApi<GeographyItem, string, GeographyFilters>(
    "geography",
    (row) => row.id
  );
  return {
    key: `geography:${title}`,
    title,
    getKey: (row) => row.id,
    getLabel: (row) => row.name,
    columns: [
      { key: "name", label: "地区名称", minWidth: 180, sortable: true },
      {
        key: "level",
        label: "层级",
        width: 100,
        format: (row) => ({ province: "省份", city: "城市", district: "区县" })[row.level],
      },
    ],
    ...api,
    selectable: (row) => (row.active ? available : unavailable),
  };
}

/**
 * 省市区使用逐级搜索，编辑回显使用独立路径接口。真实后端若改为一次返回全树，
 * 只替换本数据源，不影响字段的回写、校验与页面模型。
 */
export const geographyRegionSource: RegionCascaderSource = {
  depth: 3,
  async loadChildren(parentId, level, filters, signal) {
    const organizationId =
      filters && typeof filters === "object" && Reflect.get(filters, "organizationId") === "org-a"
        ? "org-a"
        : undefined;
    if (organizationId !== "org-a") return [];
    const geographyLevel: GeographyItem["level"][] = ["province", "city", "district"];
    const currentLevel = geographyLevel[level];
    if (!currentLevel) return [];
    const api = createMasterDataApi<GeographyItem, string, GeographyFilters>(
      "geography",
      (row) => row.id
    );
    const page = await api.search(
      {
        pageNum: 1,
        pageSize: 100,
        keyword: "",
        filters: {
          organizationId,
          level: currentLevel,
          parentId: parentId === null ? null : String(parentId),
        },
        conditions: [],
        purpose: "dialog",
      },
      { signal: signal ?? new AbortController().signal }
    );
    return page.list.map((row): RegionOption => ({ id: row.id, name: row.name }));
  },
  async resolvePath(value, filters, signal) {
    const organizationId =
      filters && typeof filters === "object" && Reflect.get(filters, "organizationId") === "org-a"
        ? "org-a"
        : undefined;
    if (organizationId !== "org-a") return [];
    const response = await request<unknown, GeographyItem[]>({
      url: "/api/v1/pilot/master-data/geography/path",
      method: "post",
      data: { id: String(value), organizationId },
      signal,
      errorPresentation: "local",
    });
    return response.map((row): RegionOption => ({ id: row.id, name: row.name }));
  },
};

export const serviceTargetReference: ReferenceSource<
  ServiceTargetItem,
  string,
  ServiceTargetFilters
> = (() => {
  const api = createMasterDataApi<ServiceTargetItem, string, ServiceTargetFilters>(
    "service-targets",
    (row) => row.id
  );
  return {
    key: "service-target",
    title: "服务对象",
    getKey: (row) => row.id,
    getLabel: (row) => row.name,
    getDescription: (row) => `${row.code} · ${row.provinceName}${row.cityName}${row.districtName}`,
    columns: [
      { key: "code", label: "对象编码", width: 120, sortable: true },
      { key: "name", label: "对象名称", minWidth: 180, sortable: true },
      { key: "type", label: "类型", width: 100 },
      { key: "cityName", label: "城市", width: 110 },
      { key: "levelName", label: "等级", width: 100 },
    ],
    ...api,
    selectable: (row) => (row.active ? available : unavailable),
  };
})();

export const projectReference: ReferenceSource<ProjectItem, string, ProjectFilters> = (() => {
  const api = createMasterDataApi<ProjectItem, string, ProjectFilters>("projects", (row) => row.id);
  return {
    key: "project",
    title: "活动服务立项",
    getKey: (row) => row.id,
    getLabel: (row) => row.name,
    getDescription: (row) => row.code,
    columns: [
      { key: "code", label: "立项编码", width: 140, sortable: true },
      { key: "name", label: "立项名称", minWidth: 220, sortable: true },
    ],
    ...api,
    selectable: (row) => (row.active ? available : unavailable),
  };
})();

export const attendeeReference: ReferenceSource<AttendeeCandidate, string, AttendeeFilters> =
  (() => {
    const api = createMasterDataApi<AttendeeCandidate, string, AttendeeFilters>(
      "attendees",
      (row) => row.id
    );
    return {
      key: "attendee",
      title: "参会人员",
      getKey: (row) => row.id,
      getLabel: (row) => row.name,
      getDescription: (row) => `${row.mobile} · ${row.targetName}`,
      columns: [
        { key: "code", label: "人员编码", width: 120 },
        { key: "name", label: "姓名", minWidth: 140, sortable: true },
        { key: "mobile", label: "手机号", width: 130 },
        { key: "targetName", label: "所属对象", minWidth: 180 },
      ],
      ...api,
      selectable: (row) => (row.active ? available : unavailable),
    };
  })();

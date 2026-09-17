import { defineMock } from "./base";
import { masterQuerySchema } from "../src/api/master-data/query";
import { queryRecords } from "../src/components/business/search/evaluate";
import { queryScopeValue } from "../src/components/business/search/model";
import { failure, success } from "./pilot-document-utils";
import {
  attendeeIdsByServiceItem,
  attendees,
  geography,
  inventory,
  inventoryIdsByOwnerParty,
  parties,
  projects,
  serviceTargetIdsByProviderParty,
  serviceItems,
  serviceTargets,
} from "./business-reference-data";

type ReferenceRow = { id: string; active: boolean };
type Filters = Record<string, unknown>;

function normalized(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("zh-CN");
}

function matchesText(row: object, keyword: unknown) {
  const value = normalized(keyword);
  if (!value) return true;
  return Object.values(row).some(
    (item) => typeof item === "string" && normalized(item).includes(value)
  );
}

function applyConditions<Row extends ReferenceRow>(rows: Row[], conditions: unknown) {
  if (!Array.isArray(conditions)) return rows;
  return rows.filter((row) =>
    conditions.every((condition) => {
      if (!condition || typeof condition !== "object") return false;
      const key = Reflect.get(condition, "key");
      const operator = Reflect.get(condition, "operator");
      const value = Reflect.get(condition, "value");
      if (typeof key !== "string") return false;
      if (operator === "contains")
        return normalized(Reflect.get(row, key)).includes(normalized(value));
      if (operator === "eq") return Reflect.get(row, key) === value;
      return false;
    })
  );
}

function createReferenceMocks<Row extends ReferenceRow>(
  source: string,
  rows: Row[],
  filter: (row: Row, filters: Filters) => boolean
) {
  return [
    {
      url: `pilot/master-data/${source}/query`,
      method: ["POST"] as ["POST"],
      body({ body }: { body?: Record<string, unknown> }) {
        try {
          const schema = masterQuerySchema(source);
          if (!schema || !body) throw new Error("该参照未声明组合查询能力");
          const filters = queryScopeValue(body.scope);
          const scoped = rows.filter((row) => filter(row, filters));
          return success(
            queryRecords(
              scoped,
              schema,
              {
                where: body.where,
                pageNum: body.pageNum,
                pageSize: body.pageSize,
                sort: body.sort,
              },
              {
                getKey: (row) => row.id,
                sortKeys: ["code", "name", "id"].filter((key) => Object.hasOwn(schema, key)),
                values: (row, key) =>
                  key === "keyword"
                    ? [Reflect.get(row, "name"), Reflect.get(row, "code"), row.id]
                    : [Reflect.get(row, key)],
              }
            )
          );
        } catch (error) {
          return failure(error instanceof Error ? error.message : "查询参数无效");
        }
      },
    },
    {
      url: `pilot/master-data/${source}/search`,
      method: ["POST"] as ["POST"],
      body({ body }: { body?: Record<string, unknown> }) {
        const query = (body?.query ?? {}) as Record<string, unknown>;
        const filters = (query.filters ?? {}) as Filters;
        let result = rows.filter((row) => filter(row, filters) && matchesText(row, query.keyword));
        result = applyConditions(result, query.conditions);
        const sort = query.sort as { key?: string; order?: string } | undefined;
        if (sort?.key) {
          result = [...result].sort((left, right) => {
            const compared = String(Reflect.get(left, sort.key!) ?? "").localeCompare(
              String(Reflect.get(right, sort.key!) ?? ""),
              "zh-CN",
              { numeric: true }
            );
            return sort.order === "desc" ? -compared : compared;
          });
        }
        const pageNum = Math.max(1, Number(query.pageNum) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10));
        const start = (pageNum - 1) * pageSize;
        return {
          code: "00000",
          data: { list: result.slice(start, start + pageSize), total: result.length },
          msg: "前端先行参照 Mock",
        };
      },
    },
    {
      url: `pilot/master-data/${source}/resolve`,
      method: ["POST"] as ["POST"],
      body({ body }: { body?: Record<string, unknown> }) {
        const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
        const filters = (body?.filters ?? {}) as Filters;
        const found = rows.filter((row) => ids.includes(row.id) && filter(row, filters));
        const foundIds = new Set(found.map((row) => row.id));
        return {
          code: "00000",
          data: { items: found, unavailableIds: ids.filter((id) => !foundIds.has(id)) },
          msg: "前端先行参照回显 Mock",
        };
      },
    },
  ];
}

const organizationMatch = (_row: ReferenceRow, filters: Filters) =>
  filters.organizationId === "org-a";

function matchesAssignment(
  assignments: Readonly<Record<string, readonly string[]>>,
  ownerId: unknown,
  rowId: string
) {
  return typeof ownerId === "string" && assignments[ownerId]?.includes(rowId) === true;
}

export default defineMock([
  {
    url: "pilot/master-data/geography/path",
    method: ["POST"] as ["POST"],
    body({ body }: { body?: { id?: string; organizationId?: string } }) {
      if (body?.organizationId !== "org-a" || !body.id) return success([]);
      const path: typeof geography = [];
      let current = geography.find((row) => row.id === body.id);
      while (current) {
        path.unshift(current);
        current = current.parentId
          ? geography.find((row) => row.id === current!.parentId)
          : undefined;
      }
      return success(path);
    },
  },
  ...createReferenceMocks("parties", parties, (row, filters) => {
    if (!organizationMatch(row, filters)) return false;
    const role = filters.role;
    return row.role === role || row.role === "both";
  }),
  ...createReferenceMocks(
    "inventory",
    inventory,
    (row, filters) =>
      organizationMatch(row, filters) &&
      matchesAssignment(inventoryIdsByOwnerParty, filters.ownerPartyId, row.id)
  ),
  ...createReferenceMocks(
    "service-items",
    serviceItems,
    (row, filters) =>
      organizationMatch(row, filters) &&
      (filters.projectId == null ||
        projects.some(
          (project) => project.id === filters.projectId && project.serviceItemId === row.id
        ))
  ),
  ...createReferenceMocks(
    "geography",
    geography,
    (row, filters) =>
      organizationMatch(row, filters) &&
      row.level === filters.level &&
      (filters.parentId == null || row.parentId === filters.parentId)
  ),
  ...createReferenceMocks(
    "service-targets",
    serviceTargets,
    (row, filters) =>
      organizationMatch(row, filters) &&
      row.type === filters.targetType &&
      matchesAssignment(serviceTargetIdsByProviderParty, filters.providerPartyId, row.id)
  ),
  ...createReferenceMocks(
    "projects",
    projects,
    (row, filters) =>
      organizationMatch(row, filters) &&
      (!filters.principalPartyId || row.principalPartyId === filters.principalPartyId)
  ),
  ...createReferenceMocks(
    "attendees",
    attendees,
    (row, filters) =>
      organizationMatch(row, filters) &&
      typeof filters.targetId === "string" &&
      row.targetId === filters.targetId &&
      matchesAssignment(attendeeIdsByServiceItem, filters.serviceItemId, row.id)
  ),
]);

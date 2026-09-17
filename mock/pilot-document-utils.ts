export function cloneMock<T>(value: T): T {
  return structuredClone(value);
}

export function success<T>(data: T, msg = "前端先行 Mock 操作成功") {
  return { code: "00000", data: cloneMock(data), msg };
}

export function failure(msg: string, code = "PILOT_VALIDATION_ERROR") {
  return { code, data: null, msg };
}

export function pageResult<T extends object>(
  rows: readonly T[],
  query: Record<string, unknown>,
  text: (row: T) => string,
  dateKey?: keyof T
) {
  const keyword = String(query.keyword ?? "").trim().toLocaleLowerCase("zh-CN");
  const status = String(query.status ?? "");
  let result = rows.filter((row) => {
    if (status && Reflect.get(row, "status") !== status) return false;
    if (keyword && !text(row).toLocaleLowerCase("zh-CN").includes(keyword)) return false;
    if (dateKey) {
      const value = String(Reflect.get(row, dateKey) ?? "");
      const start = String(query.billDateStart ?? query.serviceDateStart ?? "");
      const end = String(query.billDateEnd ?? query.serviceDateEnd ?? "");
      if (start && value < start) return false;
      if (end && value > end) return false;
    }
    return true;
  });
  const sortKey = String(query.sortKey ?? "");
  if (sortKey) {
    result = [...result].sort((left, right) => {
      const compared = String(Reflect.get(left, sortKey) ?? "").localeCompare(
        String(Reflect.get(right, sortKey) ?? ""),
        "zh-CN",
        { numeric: true }
      );
      return query.sortOrder === "desc" ? -compared : compared;
    });
  }
  const pageNum = Math.max(1, Number(query.pageNum) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10));
  const start = (pageNum - 1) * pageSize;
  return { list: cloneMock(result.slice(start, start + pageSize)), total: result.length };
}

export function bodyIds(body: Record<string, unknown> | undefined): string[] {
  return Array.isArray(body?.ids) ? [...new Set(body.ids.map(String))] : [];
}

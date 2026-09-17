/**
 * API 响应壳
 */
export interface ApiResult<T = unknown> {
  /** 业务状态码 */
  code: string;
  /** 业务数据 */
  data: T;
  /** 业务消息 */
  msg: string;
}

/** 基础查询参数 */
export interface BaseQueryParams {
  /** 页码 */
  pageNum: number;
  /** 每页记录数 */
  pageSize: number;

  /** 排序字段 */
  sortBy?: string;

  /** 排序方式（正序:ASC；反序:DESC） */
  order?: string;
}

/** 分页数据结构（仅分页接口） */
export interface PageResult<T> {
  /** 数据列表 */
  list: T[];
  /** 总记录数 */
  total: number;
}

import type { QueryPageRequest, QuerySchema } from "@/components/business/search/types";
import type { FileInfo } from "@/api/file/types";
/** 销售组织写入白名单；当前由开发 Mock 接收。 */
export interface SalePayload {
  /** 组织编码，必填，最多 30 字。 */
  code: string;
  /** 组织名称，必填，最多 80 字。 */
  name: string;
  /** 是否可被客户新选择；默认启用。 */
  active: boolean;
  /** 可选业务说明，空值为空字符串。 */
  remark: string;
  /** 组织附件，默认空数组；保存上传接口返回的名称和地址，可在表单及详情预览。 */
  attachments: FileInfo[];
}
/** 销售组织响应；组织范围由服务端确定，不允许客户端覆写。 */
export interface SaleRecord extends SalePayload {
  /** 稳定字符串主键。 */
  id: string;
  /** 数据所属组织；Mock 固定 org-a。 */
  organizationId: string;
  /** 编辑乐观锁版本。 */
  version: number;
}
/** 编辑必须携带载入时版本。 */
export interface SaleUpdate extends SalePayload {
  /** 基线版本，冲突时拒绝覆盖。 */
  version: number;
}
/** 不可由搜索条件扩大的固定范围。 */
export type SaleScope = {
  /** 登录组织范围，Mock 使用 org-a。 */
  organizationId: string;
};
/** 列表和参照共用查询请求；服务端再次校验 AST。 */
export type SaleSearchRequest = QueryPageRequest<QuerySchema, SaleScope>;

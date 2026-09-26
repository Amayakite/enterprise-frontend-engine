import type { FileInfo } from "@/api/file/types";
import type { QueryPageRequest, QuerySchema } from "@/components/business/search/types";
import type { MapLocation } from "@/components/common/MapViewer/types";
/** 公司写入白名单；当前由开发 Mock 接收。 */
export interface CompanyPayload {
  /** 公司编码，必填，最多 30 字。 */
  code: string;
  /** 公司名称，必填，最多 80 字。 */
  name: string;
  /** 档案是否启用；默认启用。 */
  active: boolean;
  /** 可选业务说明，空值为空字符串。 */
  remark: string;
  /** 联系人姓名，可选，最多 40 字。 */
  contactName: string;
  /** 联系电话，可选，最多 40 字；允许座机及分机。 */
  phone: string;
  /** 公司位置及可选业务区域；null 为尚未维护，点位和轮廓随档案整单替换。 */
  location: MapLocation | null;
  /** 合同 DOCX 模板的已上传文件引用；null 为未设置，字节不进入主表。 */
  contractTemplate: FileInfo | null;
}
/** 公司响应；组织范围由服务端确定，不允许客户端覆写。 */
export interface CompanyRecord extends CompanyPayload {
  /** 稳定字符串主键。 */
  id: string;
  /** 数据所属组织；Mock 固定 org-a。 */
  organizationId: string;
  /** 编辑乐观锁版本。 */
  version: number;
}
/** 编辑必须携带载入时版本。 */
export interface CompanyUpdate extends CompanyPayload {
  /** 基线版本，冲突时拒绝覆盖。 */
  version: number;
}
/** 不可由搜索条件扩大的固定范围。 */
export type CompanyScope = {
  /** 登录组织范围，Mock 使用 org-a。 */
  organizationId: string;
};
/** 列表和参照共用查询请求；服务端再次校验 AST。 */
export type CompanySearchRequest = QueryPageRequest<QuerySchema, CompanyScope>;

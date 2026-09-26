import type { BusinessModuleContract } from "@/components/business/crud/module";
import type { QuerySchema } from "@/components/business/search/types";
import type {
  CompanyRecord,
  CompanyPayload,
  CompanyUpdate,
  CompanySearchRequest,
  CompanyScope,
} from "@/api/base/company/types";
/** Company 页面无需另一份实体模型；只具体化标准接口约定。 */
export interface CompanyContract extends BusinessModuleContract {
  /** 一套字段供四个场景使用。 */
  Model: CompanyRecord;
  /** 接口实体保留版本。 */
  Entity: CompanyRecord;
  /** ID 不作数字转换。 */
  Id: string;
  /** 查询从 config.fields 派生。 */
  Schema: QuerySchema;
  /** 固定组织，不是用户筛选条件。 */
  Scope: CompanyScope;
  /** 公司列表的固定范围、查询和分页请求。 */
  Query: CompanySearchRequest;
  /** 新增白名单。 */
  Create: CompanyPayload;
  /** 编辑白名单及版本。 */
  Update: CompanyUpdate;
  /** Mock 写入返回实体。 */
  Result: CompanyRecord;
  /** 页面上下文由公共组合生成。 */
  Context: {
    /** 登录组织。 */ organizationId: string;
    /** 用户与权限隔离 key。 */ scopeKey: string;
  };
}

import type { BusinessModuleContract } from "@/components/business/crud/module";
import type { QuerySchema } from "@/components/business/search/types";
import type {
  SaleRecord,
  SalePayload,
  SaleUpdate,
  SaleSearchRequest,
  SaleScope,
} from "@/api/base/sale/types";
/** Sale 页面无需另一份实体模型；只具体化标准合同。 */
export interface SaleContract extends BusinessModuleContract {
  /** 一套字段供四个场景使用。 */
  Model: SaleRecord;
  /** 接口实体保留版本。 */
  Entity: SaleRecord;
  /** ID 不作数字转换。 */
  Id: string;
  /** 查询从 config.fields 派生。 */
  Schema: QuerySchema;
  /** 固定组织，不是用户筛选条件。 */
  Scope: SaleScope;
  /** 列表与参照使用相同请求 DTO。 */
  Query: SaleSearchRequest;
  /** 新增白名单。 */
  Create: SalePayload;
  /** 编辑白名单及版本。 */
  Update: SaleUpdate;
  /** Mock 写入返回实体。 */
  Result: SaleRecord;
  /** 页面上下文由公共装配生成。 */
  Context: {
    /** 登录组织。 */ organizationId: string;
    /** 用户与权限隔离 key。 */ scopeKey: string;
  };
}

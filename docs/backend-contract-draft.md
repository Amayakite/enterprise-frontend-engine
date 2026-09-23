# 后端接口契约草案

本页供前后端确认接口边界，**不是已发布的后端协议**。路径、DTO 和示例取自当前客户、销售组织 API 与开发 Mock。真实持久化、身份鉴权、数据范围、事务与跨端同步均待后端实现并联调；示例成功不能证明这些能力已完成。

## 1. 传输与认证

- 当前请求前缀为环境变量 `VITE_APP_BASE_API`；下文路径相对该前缀。统一请求层注入 `Authorization: Bearer <accessToken>`，账号登录、刷新和退出需另行联调。
- 当前普通成功响应为 `{ "code": "00000", "data": ..., "msg": "操作成功" }`，成功码是字符串。分页 `data` 为 `{ "list": [], "total": 0 }`，空列表也是成功。
- `signal` 是浏览器请求取消能力，不代表服务端事务回滚。查询可取消；写入超时或取消不能默认判定未写入。
- 当前错误码映射见 [api-codes.ts](../src/config/api-codes.ts)：`A0230` 访问令牌无效、`A0231` 刷新令牌无效、`A0301` 权限不足。请求层最多重放一次令牌刷新后的请求，**后端需确认被拒绝的原请求未执行写入**。
- 请求层读取响应头 `x-request-id` / `request-id` 供排障。跨域时后端需暴露相应响应头；目前没有正式服务验证。

源码：[统一请求](../src/utils/request.ts)、[错误分类](../src/utils/request-error.ts)、[HTTP 类型](../src/types/http.ts)。

## 2. 端点清单

| 模块     | 方法与路径                                 | 当前入参/结果                                    | 后端待确认                             |
| -------- | ------------------------------------------ | ------------------------------------------------ | -------------------------------------- |
| 销售组织 | `POST /api/v1/pilot/sales/search`          | `SaleSearchRequest` → 分页 `SaleRecord`          | 正式路径、字段与排序白名单             |
| 销售组织 | `POST /api/v1/pilot/sales/resolve`         | `{ ids, filters }` → `{ items, unavailableIds }` | 最大批量数、不可访问原因是否可公开     |
| 销售组织 | `GET /api/v1/pilot/sales/:id`              | 字符串 ID → `SaleRecord`                         | 不存在/无权访问策略                    |
| 销售组织 | `POST /api/v1/pilot/sales`                 | `SalePayload` → 完整 `SaleRecord`                | 编码唯一范围、幂等策略                 |
| 销售组织 | `PUT /api/v1/pilot/sales/:id`              | `SaleUpdate` → 完整 `SaleRecord`                 | 原子版本校验与版本冲突码               |
| 客户     | `POST /api/v1/pilot/customers/search`      | `CustomerSearchRequest` → 分页 `CustomerRecord`  | 正式路径、列表是否返回完整子表         |
| 客户     | `GET /api/v1/pilot/customers/:id`          | 字符串 ID → `CustomerRecord`                     | 数据范围、详情字段                     |
| 客户     | `POST /api/v1/pilot/customers`             | `CustomerSavePayload` → 完整 `CustomerRecord`    | 编码生成、子表 ID、事务                |
| 客户     | `PUT /api/v1/pilot/customers/:id`          | 主子表负载加 `version` → 完整记录                | 子表删除语义与并发策略                 |
| 客户     | `POST /api/v1/pilot/customers/:id/actions` | `{ action, version }` → 完整记录                 | 审核/撤销/启用/停用状态机              |
| 客户     | `DELETE /api/v1/pilot/customers/:id`       | body `{ version }` → `null`                      | 软删除、关联限制、DELETE body 是否接受 |

客户现有 `GET /api/v1/pilot/customers` 是兼容 `getPage` 的简单参数入口；标准业务列表使用 `POST .../search`。是否保留旧入口应由双方确认，不能让页面同时维护两套新协议。

类型与方法：[Sale API](../src/api/base/sale/index.ts)、[Sale DTO](../src/api/base/sale/types.ts)、[Customer API](../src/api/base/customer/index.ts)、[Customer DTO](../src/api/base/customer/types.ts)。批量操作另有公共协议，应沿用 [batch.ts](../src/api/common/batch.ts) 核对，不把整批成功等同于每条成功。

## 3. 列表查询与分页

销售组织查询示例，`POST /api/v1/pilot/sales/search`：

```json
{
  "scope": { "key": "org-a", "value": { "organizationId": "org-a" } },
  "where": {
    "kind": "group",
    "id": "query",
    "operator": "and",
    "children": [
      { "kind": "condition", "id": "active", "field": "active", "operator": "eq", "value": true }
    ]
  },
  "pageNum": 1,
  "pageSize": 20,
  "sort": { "key": "code", "order": "asc" }
}
```

```json
{
  "code": "00000",
  "data": {
    "list": [
      {
        "id": "sale-east",
        "organizationId": "org-a",
        "code": "SALE-HD",
        "name": "华东销售组织",
        "active": true,
        "remark": "负责华东区域客户",
        "version": 0
      }
    ],
    "total": 1
  },
  "msg": "操作成功"
}
```

- `pageNum` 从 1 开始，当前 `pageSize` 为 1–100。`total` 为非负整数，是筛选后的总数。无筛选传 `where: null`，无排序传 `sort: null`。
- `scope.key` 是客户端范围身份，不能作为授权凭证；后端从登录身份确定允许的组织和记录范围，并与请求范围取交集。用户条件不能扩大固定范围。
- AST 支持 and/or 分组及字段允许的操作符；当前限制深度 3、组 20、条件 50、集合成员 100、文本 256。后端应独立验证，不直接把客户端字段拼进 SQL。
- Sale 当前排序白名单为 `code/name`；Customer 为 `customerCode/customerName/createdTime`。非法字段/方向拒绝，不能静默退回默认排序；分页排序还需确认稳定的主键兜底。
- 查询节点 `id` 只供前端定位，不是记录 ID。布尔 `false`、数字 `0` 与字符串 `"0"` 不视为空值。日期、时间及金额的最终协议需确认：当前金额能力采用十进制字符串，不转 JS 浮点数。

定义：[查询模型](../src/components/business/search/types.ts)、[校验限制](../src/components/business/search/model.ts)、[客户排序](../src/api/base/customer/query.ts)。

## 4. 新增、编辑与版本

Sale 新增请求（`POST /api/v1/pilot/sales`）：

```json
{ "code": "SALE-HZ", "name": "华中销售组织", "active": true, "remark": "" }
```

当前 Mock 返回完整实体，详情 `GET` 的 `data` 结构相同：

```json
{
  "code": "00000",
  "data": {
    "id": "sale-new-1",
    "organizationId": "org-a",
    "code": "SALE-HZ",
    "name": "华中销售组织",
    "active": true,
    "remark": "",
    "version": 0
  },
  "msg": "操作成功"
}
```

编辑 `PUT /api/v1/pilot/sales/sale-new-1` 在相同白名单字段上加 `"version": 0`。当前 Mock 校验基线版本，成功返回 `version: 1`；正式后端版本可换类型，但必须先统一 DTO 和前端适配。

`id/organizationId/version` 不接受新增请求覆写，编码和名称去首尾空格。当前编码最多 30 字、名称最多 80 字、备注最多 300 字；编码唯一范围（全局/组织）待确认。新增 ID、组织与版本由服务端决定，字符串 ID 不转数字。

## 5. 客户整单与业务子表

客户新增负载示例，地理 ID 使用当前 Mock 种子；正式枚举与地区数据由后端确认：

```json
{
  "saleId": "sale-east",
  "customerName": "示例客户",
  "shortName": "示例",
  "customerType": "distributor",
  "creditCode": "",
  "phone": "021-12345678",
  "provinceId": "310000",
  "cityId": "310100",
  "districtId": "310115",
  "address": "示例路 1 号",
  "remark": "",
  "contacts": [
    {
      "id": "contact-local-1",
      "name": "联系人",
      "position": "采购",
      "phone": "13800000000",
      "email": "",
      "primary": true
    }
  ],
  "addresses": [
    {
      "id": "address-local-1",
      "label": "默认地址",
      "recipient": "收货人",
      "phone": "13800000000",
      "address": "示例路 1 号",
      "primary": true
    }
  ]
}
```

当前只支持 aggregate 整单保存：主表与 `contacts/addresses` 全量提交，编辑增加实体基线 `version`。Mock 用提交数组替换子表；数组中省略旧行等价于删除该行。正式后端必须确认这一语义、事务边界、最大行数、权限，以及拒绝时不发生部分写入。

Mock 接受前端生成的子行字符串 ID 并原样回传；这不是已确认的数据库主键策略。后端若重新分配 ID，需在保存完整实体中回传正式行 ID，或约定临时 ID 映射，再适配 `resolveSaved`，不能让页面猜测对应关系。

响应 `CustomerRecord` 在写入字段之外增加 `id/customerCode/saleName`、省市区名称、`status/active`、`createdBy/createdTime/updatedTime/version`。服务端字段不能由普通编辑负载改变。若真实列表只返回摘要，应拆分列表 DTO 并在 API/页面适配，不强行伪装为完整实体。

当前 Mock 规则：销售组织须存在且启用；客户类型为 distributor/chain/hospital；省市区必须关联；非空子表必须且仅有一个默认项；已审核客户先撤销审核再编辑。这些仅为示例，业务负责人和后端需确认正式规则。[Mock 校验与实体回填](../mock/customer-data.ts)。

## 6. 参照解析

销售组织 `POST /api/v1/pilot/sales/resolve`：

```json
{ "ids": ["sale-east", "missing-id"], "filters": { "organizationId": "org-a" } }
```

```json
{
  "code": "00000",
  "data": {
    "items": [
      {
        "id": "sale-east",
        "organizationId": "org-a",
        "code": "SALE-HD",
        "name": "华东销售组织",
        "active": true,
        "remark": "负责华东区域客户",
        "version": 0
      }
    ],
    "unavailableIds": ["missing-id"]
  },
  "msg": "操作成功"
}
```

每个请求 ID 必须得到解析结果或进入 `unavailableIds`，不返回请求外记录、不依赖返回顺序。当前 Mock 上限 500。已停用但可查看的历史记录可解析回显，不能据此允许新选择。跨页新增回写仍会重新 resolve 并校验可选性。

## 7. 错误与未知结果

当前 Mock 的业务拒绝示例（版本冲突也暂用同一个通用业务码）：

```json
{ "code": "PILOT_VALIDATION_ERROR", "data": null, "msg": "记录已更新，请重新打开" }
```

| 场景                      | 前端当前行为                   | 待后端确认                                                      |
| ------------------------- | ------------------------------ | --------------------------------------------------------------- |
| 明确业务/权限拒绝         | 显示局部错误，可修改后重提     | HTTP 状态、稳定错误码；必须保证未写入                           |
| 版本冲突                  | 保留当前输入，提示重新载入     | 独立冲突码、最新版本/差异是否返回，不自动覆盖                   |
| 网络中断、5xx、非协议响应 | 视为保存结果未知，阻止盲目重提 | 幂等键、操作状态查询、请求 ID 与去重时效                        |
| 保存成功但实体回填失败    | 只重读回执/实体，不重复写入    | 返回完整实体还是 `{ id }` 回执；回读一致性                      |
| 字段/子表行校验失败       | 当前通用错误以 message 显示    | 字段路径、子行稳定 ID、错误数组协议；尚无真实服务端字段错误适配 |
| 批量部分成功              | 逐项显示，失败项才允许重试     | 每项结果、版本、整批与单项事务边界                              |

建议先确认以上协议，再改请求层与 API 适配；不在表单页面散布后端错误码判断。

## 8. 联调前需双方确认

1. 真实路径、认证/刷新、菜单和按钮权限映射，以及后端组织/行级权限。
2. ID 和 version 类型、创建/更新白名单、日期时区、金额精度、空值与枚举。
3. 分页与排序、AST 白名单和限制、参照解析及不可访问记录处理。
4. 整单事务、子表删除与 ID 映射、保存回执、版本冲突、幂等与未知结果查询。
5. 用户偏好/草稿/查询方案的服务端归属、容量、并发版本和迁移策略。查询方案当前只在公共本机存储中保存，尚未定义远端 API；`userDataStore` 的适配能力不等于业务同步已完成。
6. Excel 解析、校验和导入执行归后端；前端只负责上传、任务状态和结果展示，不把浏览器解析能力当作正式导入事务。

首轮联调建议用 Sale 的查询→新增→详情→带版本编辑跑通真实链路，再接 Customer 主子表和跨模块参照，最后接批量、导入与用户偏好同步。

import type { FieldKey } from "../fields/types";

/** 模块选择的内容布局，与 tab/dialog/drawer 打开方式独立；省略配置保留旧布局。 */
export interface CrudLayoutOptions {
  /**
   * simple 为紧凑字段档案；structured 为分区页面；两者均满高铺满。不会随字段显隐切换。
   * @example
   * `layout: { preset: "simple" }`
   */
  preset: "simple" | "structured";
  /** 页面标题使用的实体称呼；省略使用模块 meta.title，不影响路由或缓存 key。
   * @example
   * `entityLabel: "客户"`
   */
  entityLabel?: string;
}

/** 详情摘要只引用已配置且在详情场景可见的字段；复用原字段展示，不读取隐藏字段。 */
export interface CrudDetailSummary<Model> {
  /** 作为记录标题的字段；未填写或不可见时回退为页面标题。
   * @example
   * `titleField: "name"`
   */
  titleField: FieldKey<Model>;
  /** 标题下的辅助字段，按声明顺序展示标签和值；省略为空。
   * @example
   * `descriptionFields: ["code"]`
   */
  descriptionFields?: readonly FieldKey<Model>[];
  /** 标题旁的状态字段，沿用字段格式化；省略为空，不根据字段名猜测状态。
   * @example
   * `statusFields: ["active"]`
   */
  statusFields?: readonly FieldKey<Model>[];
}

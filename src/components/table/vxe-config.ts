// import XEUtils from "xe-utils";
import { setConfig } from "vxe-table/es/v-x-e-table";
// import zhCN from "vxe-table/es/locale/lang/zh-CN";

let configured = false;

/** TableView 首次挂载时初始化一次；组件采用局部导入，不全局 app.use(VXETable)。 */
export function configureVxeTable() {
  if (configured) return;
  setConfig({
    // i18n: (key, args) => XEUtils.toFormatString(XEUtils.get(zhCN, key), args),
    size: "medium",
    // VXE 不管理本项目的业务弹窗；Element Plus 独立管理遮罩和焦点。
    // 移除旧 9999，内核辅助层保持在普通业务对话框之下。
    zIndex: 1000,
    table: {
      autoResize: true,
      // 完整网格线让密集业务表格的列边界更清楚；外框仍由 TableView 统一管理。
      border: "full",
      emptyText: "暂无数据",
      align: "left",
      headerAlign: "left",
    },
  });
  configured = true;
}

// 仅供原生 TypeScript 合同测试解析间接导入的 SFC；应用由 vue-tsc 检查真实页面。
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent;
  export default component;
}

import "axios";

declare module "axios" {
  interface AxiosRequestConfig {
    /** 仅抑制普通错误提示；取消静默，鉴权与权限仍走全局处理。 */
    errorPresentation?: "global" | "local";
  }
}

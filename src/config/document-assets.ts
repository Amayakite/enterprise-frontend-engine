import { version as fontVersion } from "@docx-editor.dev/fonts/package.json";
import type { FontUrlSource } from "@docx-editor.dev/core/editor";

/** 字体目录与准备脚本一致；版本 URL 可长期缓存，支持 Vite 子目录部署。 */
const fontRoot = `${import.meta.env.BASE_URL}vendor/document-fonts/${fontVersion}/`;

/** 两个编辑器共享的可分发西文字体；中文暂使用系统字体，不能保证跨设备分页一致。 */
export const documentFontSources: FontUrlSource[] = [
  {
    url: `${fontRoot}LiberationSerif-Regular.ttf`,
    family: "Times New Roman",
    weight: 400,
    style: "normal",
  },
  {
    url: `${fontRoot}LiberationSerif-Bold.ttf`,
    family: "Times New Roman",
    weight: 700,
    style: "normal",
  },
  {
    url: `${fontRoot}LiberationSerif-Italic.ttf`,
    family: "Times New Roman",
    weight: 400,
    style: "italic",
  },
  {
    url: `${fontRoot}LiberationSerif-BoldItalic.ttf`,
    family: "Times New Roman",
    weight: 700,
    style: "italic",
  },
];

/** DOCX 下载及预览统一 MIME，避免被浏览器识别为普通 ZIP。 */
export const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// TODO：确定客户中文字体的分发授权后，增加中文字体清单和按文档字族选择的加载器。
// 不将本机 Windows 字体直接复制进项目；替代字体必须用真实合同核对分页。

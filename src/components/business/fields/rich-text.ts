import DOMPurify from "dompurify";

/** 富文本独立控件接口约定；字段模型保存 HTML 字符串，空值使用空字符串或 null。 */
export interface RichTextProps {
  /** 编辑区域 CSS 高度；默认 240px，不含工具栏。
   * @example
   * `height: "320px"`
   */
  height?: string;
  /** 未填写时的提示；默认“请输入内容”，字段顶层 placeholder 优先。 */
  placeholder?: string;
  /** 可见文本最大 UTF-16 长度；正整数，省略不限；不计算 HTML 标签，后端仍需校验。 */
  maxlength?: number;
  /** 详情展示：text 默认纯文本；html 保留经过清理的基础排版。表格始终纯文本。 */
  readonlyDisplay?: "text" | "html";
}

/**
 * 清理富文本后再展示，不信任编辑器产生或后端返回的 HTML。
 * @param html 原 HTML 字符串；空值返回空字符串。
 * @returns 限定基础排版、链接、图片及表格的 HTML，移除脚本/事件/内联样式。
 * @remarks 不修改原模型；服务端接收、存储和其他终端展示仍须独立校验。
 * @example
 * `sanitizeRichText(model.description)`
 */
export function sanitizeRichText(html: string | null | undefined): string {
  return DOMPurify.sanitize(html ?? "", {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "a",
      "img",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "pre",
      "code",
      "span",
      "div",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "colspan", "rowspan"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}

/** 富文本语义；用于必填/长度校验和文本展示，不以 HTML 源码长度判断内容。 */
export interface RichTextContent {
  /** 解码后的文本，块之间保留换行；不包含脚本、样式内容或零宽占位符。 */
  text: string;
  /** 可见文本或有效图片存在时为 true；空标签、空白和换行占位均为 false。 */
  hasContent: boolean;
}

/**
 * 取得富文本的可见内容；不把解析节点挂入页面。
 * @param html HTML 字符串；其他值视为空。
 * @returns 文本及是否有可展示内容。
 * @example
 * `richTextContent("<p><br></p>").hasContent // false`
 */
export function richTextContent(html: unknown): RichTextContent {
  /** 用浏览器解析富文本后读取内容，避免用正则猜测嵌套 HTML 结构。 */
  const doc = new DOMParser().parseFromString(
    sanitizeRichText(typeof html === "string" ? html : ""),
    "text/html"
  );
  doc.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  doc
    .querySelectorAll("p,div,li,blockquote,h1,h2,h3,h4,h5,h6,tr")
    .forEach((node) => node.append("\n"));
  /** 去掉 HTML 标签及零宽字符后的可见文字，用于摘要和空内容判断。 */
  const text = (doc.body.textContent ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  return {
    text,
    hasContent:
      !!text || Array.from(doc.images).some((image) => !!image.getAttribute("src")?.trim()),
  };
}

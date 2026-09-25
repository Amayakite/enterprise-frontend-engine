/**
 * 在编辑器解析前检查 ZIP 中的 Word 主文档，防止无效输入被当作空文档。
 * @param bytes 已通过上传大小校验的本地文件字节；不会修改或上传。
 * @throws ZIP 损坏、缺少 DOCX 必需部件或主文档 XML 无效时抛错。
 * @remarks 这是格式检查，不是恶意文件扫描或完整 OOXML 合规校验。
 * @example
 * `await validateDocx(await file.arrayBuffer())`
 */
export async function validateDocx(bytes: ArrayBuffer): Promise<void> {
  const { default: JSZip } = await import("jszip");
  try {
    const zip = await JSZip.loadAsync(bytes);
    const document = zip.file("word/document.xml");
    if (!zip.file("[Content_Types].xml") || !document) throw new Error("缺少 Word 主文档");
    const xml = new DOMParser().parseFromString(await document.async("string"), "application/xml");
    const root = xml.documentElement;
    if (
      xml.querySelector("parsererror") ||
      root.localName !== "document" ||
      ![
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "http://purl.oclc.org/ooxml/wordprocessingml/main",
      ].includes(root.namespaceURI ?? "")
    ) {
      throw new Error("Word 主文档 XML 无效");
    }
  } catch {
    throw new Error("文件不是可读取的 DOCX，或文件已损坏。请用 Word 另存为 .docx 后重试。");
  }
}

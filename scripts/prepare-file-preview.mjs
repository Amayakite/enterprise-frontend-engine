import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// PDF 中文字形、标准字体与图片解码器随部署发布，禁止运行时回退到第三方 CDN。
const source = dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")));
const target = fileURLToPath(new URL("../public/vendor/file-preview/pdfjs/", import.meta.url));
await mkdir(target, { recursive: true });
await Promise.all(
  ["cmaps", "standard_fonts", "wasm"].map((name) =>
    cp(join(source, name), join(target, name), { recursive: true })
  )
);

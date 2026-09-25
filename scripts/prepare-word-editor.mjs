import { cp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 依赖锁定版本是资源版本；不使用构建时间，避免每次发布让浏览器缓存失效。
const root = dirname(fileURLToPath(import.meta.resolve("@docx-editor.dev/fonts/package.json")));
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const target = fileURLToPath(
  new URL(`../public/vendor/document-fonts/${version}/`, import.meta.url)
);
const files = ["Regular", "Bold", "Italic", "BoldItalic"].map(
  (face) => `LiberationSerif-${face}.ttf`
);
const manifest = JSON.stringify({ version, files, schema: 1 });
const marker = join(target, "manifest.json");
let prepared = false;
try {
  prepared = (await readFile(marker, "utf8")) === manifest;
  await Promise.all(
    [...files, "licenses", "THIRD_PARTY_NOTICES.md"].map((file) => access(join(target, file)))
  );
} catch {
  prepared = false;
}
if (!prepared) {
  await mkdir(target, { recursive: true });
  await Promise.all(files.map((file) => cp(join(root, "assets", file), join(target, file))));
  await cp(join(root, "licenses"), join(target, "licenses"), { recursive: true });
  await cp(join(root, "THIRD_PARTY_NOTICES.md"), join(target, "THIRD_PARTY_NOTICES.md"));
  await writeFile(marker, manifest);
}

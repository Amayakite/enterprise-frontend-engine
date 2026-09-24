import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { defineMock } from "./base";
import { success, failure } from "./pilot-document-utils";

/** 开发期原始附件字节；服务重启或本模块热更新即清空，不代表持久化文件服务。 */
const uploads = new Map<string, Buffer>();

export default defineMock([
  {
    url: "files",
    method: ["POST"],
    async body({ body, headers }) {
      if (!headers["content-type"]?.startsWith("multipart/form-data"))
        return failure("请使用 multipart 上传文件");
      const candidate: unknown = body.file;
      const file: unknown = Array.isArray(candidate) ? candidate[0] : candidate;
      if (
        !file ||
        typeof file !== "object" ||
        !("filepath" in file) ||
        typeof file.filepath !== "string" ||
        !("originalFilename" in file) ||
        typeof file.originalFilename !== "string"
      )
        return failure("未收到文件");
      const path = resolve(file.filepath);
      if (dirname(path) !== resolve(tmpdir()) || !/^efe-upload-[\da-f-]+$/.test(basename(path)))
        return failure("无效的临时上传文件");
      try {
        const data = await readFile(path);
        const total = [...uploads.values()].reduce((size, item) => size + item.length, 0);
        if (total + data.length > 200 * 1024 * 1024)
          return failure("Mock 附件内存已满，请重启开发服务");
        const id = randomUUID();
        uploads.set(id, data);
        return success({ name: file.originalFilename, url: `/api/v1/pilot-files/${id}` });
      } finally {
        await unlink(path);
      }
    },
  },
  {
    url: "files",
    method: ["DELETE"],
    body: ({ query }) => {
      const path: unknown = query.filePath;
      if (typeof path === "string" && path.startsWith("/api/v1/pilot-files/"))
        uploads.delete(path.slice("/api/v1/pilot-files/".length));
      return success(null, "Mock 附件已移除");
    },
  },
  {
    url: "pilot-files/:name",
    method: ["GET"],
    response(req, res) {
      const id: unknown = req.params.name;
      const data = typeof id === "string" ? uploads.get(id) : undefined;
      res.setHeader("Cache-Control", "no-store");
      if (!data) {
        res.statusCode = 404;
        res.end("Mock 附件不存在或已随开发服务重启清空，请重新上传。");
        return;
      }
      // 保留原始字节，格式由前端文件名判断，避免浏览器直接执行上传内容。
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(data);
    },
  },
]);

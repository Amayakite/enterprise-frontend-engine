import type { Plugin } from "vite";
import osmtogeojson from "osmtogeojson";

/**
 * 仅开发期代理一次用户主动触发的地点查询，生产构建不包含该服务。
 * endpoint 由服务端环境配置；不接受浏览器提供 URL 或 Overpass QL。
 * 使用 HTTP 缓存、单并发和最小请求间隔；正式产品应接入自建数据服务。
 */
export function osmBoundaryDevPlugin(endpoint: string): Plugin {
  let busy = false;
  let nextAllowed = 0;
  return {
    name: "osm-boundary-development-service",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__map-data/osm-boundaries", async (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "GET") return reply(405, { message: "仅支持 GET" });
        const params = new URL(req.url ?? "", "http://localhost").searchParams;
        const lng = Number(params.get("lng")),
          lat = Number(params.get("lat"));
        if (
          !params.has("lng") ||
          !params.has("lat") ||
          !Number.isFinite(lng) ||
          !Number.isFinite(lat) ||
          Math.abs(lng) > 180 ||
          Math.abs(lat) > 85
        )
          return reply(400, { message: "坐标无效" });
        if (busy || Date.now() < nextAllowed) return reply(429, { message: "请稍后再查询" });
        busy = true;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const cancel = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.on("close", cancel);
        try {
          // 查找附近有名称的闭合场所面；不限制行业，不包含道路或整片行政区。
          const query = `[out:json][timeout:10][maxsize:16777216];(way["name"][~"^(building|amenity|healthcare|landuse|leisure|shop|office|tourism)$"~"."](around:1500,${lat},${lng})(if:is_closed());relation["name"]["type"="multipolygon"][~"^(building|amenity|healthcare|landuse|leisure|shop|office|tourism)$"~"."](around:1500,${lat},${lng}););out body geom;`;
          const upstream = await fetch(endpoint, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "EnterpriseFrontendEngine-MapLab/1.0 (development boundary evaluation)",
            },
            body: new URLSearchParams({ data: query }),
          });
          if (!upstream.ok) return reply(502, { message: "OSM 查询服务暂不可用" });
          const reader = upstream.body?.getReader();
          if (!reader) throw new Error("empty body");
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 2_000_000) {
              await reader.cancel();
              throw new Error("response too large");
            }
            chunks.push(value);
          }
          const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (
            typeof data !== "object" ||
            data === null ||
            !("elements" in data) ||
            !Array.isArray(data.elements) ||
            "remark" in data
          )
            throw new Error("incomplete response");
          const collection = osmtogeojson(data, { flatProperties: true });
          res.setHeader("Cache-Control", "private, max-age=600");
          reply(200, collection);
        } catch {
          if (!res.destroyed)
            reply(503, { message: "OSM 查询超时或数据不可用，请继续手绘或稍后重试" });
        } finally {
          clearTimeout(timer);
          res.off("close", cancel);
          busy = false;
          nextAllowed = Date.now() + 1000;
        }
      });
    },
  };
}

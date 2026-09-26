import gcoord from "gcoord";
import type {
  MapBoundaryCandidate,
  MapBoundaryRequest,
  MapPoint,
} from "@/components/common/MapViewer/types";

/** 解析同源服务返回的 WGS84 GeoJSON；不自动选取最近对象，不丢弃洞或多片区域。 */
export function parseOsmBoundaries(value: unknown): MapBoundaryCandidate[] {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features))
    throw new Error("边界服务返回格式错误");
  const candidates: MapBoundaryCandidate[] = [];
  for (const feature of value.features) {
    if (!isRecord(feature) || !isRecord(feature.geometry) || !isRecord(feature.properties))
      continue;
    // osmtogeojson 标记 tainted 表示关系缺成员，不能作为完整边界接受。
    if (feature.properties.tainted) continue;
    const id = String(feature.id ?? "");
    if (!/^(way|relation)\/\d+$/.test(id)) continue;
    const geometry = feature.geometry;
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") continue;
    const rawPolygons: unknown =
      geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    if (!Array.isArray(rawPolygons) || !rawPolygons.length || rawPolygons.length > 100) continue;
    try {
      let vertices = 0;
      const polygons = rawPolygons.map((rawPolygon: unknown) => {
        if (!Array.isArray(rawPolygon) || !rawPolygon.length) throw new Error("无外环");
        return rawPolygon.map((rawRing: unknown) => {
          if (!Array.isArray(rawRing) || rawRing.length < 4) throw new Error("无效环");
          vertices += rawRing.length;
          if (vertices > 10000) throw new Error("边界过于复杂");
          const ring = rawRing.map((position: unknown): MapPoint => {
            if (
              !Array.isArray(position) ||
              typeof position[0] !== "number" ||
              typeof position[1] !== "number" ||
              !Number.isFinite(position[0]) ||
              !Number.isFinite(position[1]) ||
              Math.abs(position[0]) > 180 ||
              Math.abs(position[1]) > 85
            )
              throw new Error("无效坐标");
            const [lng, lat] = gcoord.transform(
              [position[0], position[1]],
              gcoord.WGS84,
              gcoord.GCJ02
            );
            return { lng, lat };
          });
          const first = ring[0],
            last = ring.at(-1);
          if (!first || !last || first.lng !== last.lng || first.lat !== last.lat)
            throw new Error("未闭合");
          ring.pop();
          if (new Set(ring.map((p) => `${p.lng},${p.lat}`)).size < 3) throw new Error("退化环");
          return ring;
        });
      });
      const exterior = polygons[0]?.[0];
      if (!exterior) continue;
      candidates.push({
        id,
        name: typeof feature.properties.name === "string" ? feature.properties.name : "未命名场所",
        source: "osm",
        sourceUrl: `https://www.openstreetmap.org/${id}`,
        geometry:
          polygons.length === 1 && polygons[0]?.length === 1
            ? { kind: "polygon", points: exterior }
            : { kind: "multipolygon", polygons },
      });
    } catch {
      /* 单个不完整面不影响其它候选；绝不以包围盒替代缺失的边界。 */
    }
  }
  return candidates;
}

/** 在 API 边界验证未知 JSON，不通过类型断言假设上游结构。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 创建同源 OSM 边界加载器；endpoint 为以 / 开头的本项目服务路径，不允许跨域 URL。
 * 服务接收 WGS84 lng/lat，返回 WGS84 FeatureCollection；无业务鉴权 Token 发送给外部地图服务。
 * 开发使用 /__map-data/osm-boundaries；生产必须由部署方提供同源数据服务。
 * @example
 * const loadPlaceBoundary = createOsmBoundaryLoader('/api/maps/osm-boundaries');
 */
export function createOsmBoundaryLoader(endpoint: string) {
  if (!endpoint.startsWith("/") || endpoint.startsWith("//") || endpoint.includes("\\"))
    throw new Error("OSM 边界接口必须是同源路径");
  return async ({ place, signal }: MapBoundaryRequest): Promise<MapBoundaryCandidate[]> => {
    const [lng, lat] = gcoord.transform(
      [place.point.lng, place.point.lat],
      gcoord.GCJ02,
      gcoord.WGS84
    );
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set("lng", lng.toFixed(6));
    url.searchParams.set("lat", lat.toFixed(6));
    // 该服务返回标准 GeoJSON，区别于项目 ApiResult；错误由地图页内反馈统一呈现。
    const response = await fetch(url, {
      signal,
      credentials: "same-origin",
      headers: { Accept: "application/geo+json, application/json" },
    });
    if (!response.ok) throw new Error("边界服务暂不可用");
    const candidates = parseOsmBoundaries(await response.json());
    const matches = (name: string) =>
      Number(name.length > 2 && (place.name.includes(name) || name.includes(place.name)));
    return candidates.sort((a, b) => matches(b.name) - matches(a.name)).slice(0, 20);
  };
}

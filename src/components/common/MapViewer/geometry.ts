import { destination } from "@turf/destination";
import { distance } from "@turf/distance";
import type { MapGeometry, MapPoint } from "./types";

/** 接受普通 GCJ-02 坐标；拒绝非法数字与超出经纬度范围的数据。 */
export function validPoint(point: MapPoint): boolean {
  return (
    Number.isFinite(point.lng) &&
    Math.abs(point.lng) <= 180 &&
    Number.isFinite(point.lat) &&
    Math.abs(point.lat) <= 90
  );
}

/** 从轮廓取得朝北的四角外接矩形；不支持跨日期变更线或洞，不修改输入。 */
export function boundsPoints(points: readonly MapPoint[]): MapPoint[] {
  if (points.length < 3 || points.some((point) => !validPoint(point)))
    throw new Error("区域需要至少三个有效坐标");
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity;
  for (const point of points) {
    west = Math.min(west, point.lng);
    east = Math.max(east, point.lng);
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
  }
  if (west === east || south === north || east - west >= 180) throw new Error("区域范围无效");
  return [
    { lng: west, lat: south },
    { lng: east, lat: south },
    { lng: east, lat: north },
    { lng: west, lat: north },
  ];
}

/**
 * 以地点为中心生成朝北的估算矩形，宽高为 1～10000 米；Turf 负责距离换算。
 * GCJ-02 上的球面近似仅用于编辑草稿，不是测绘精度或真实场所范围。
 * @example
 * rectangleAt({ lng: 116.4, lat: 39.9 }, 400, 200)
 */
export function rectangleAt(center: MapPoint, width: number, height: number): MapPoint[] {
  if (
    !validPoint(center) ||
    Math.abs(center.lat) > 80 ||
    ![width, height].every((value) => Number.isFinite(value) && value >= 1 && value <= 10000)
  )
    throw new Error("宽高须为 1～10000 米，中心须在南北纬 80 度以内");
  const position = [center.lng, center.lat];
  const west = destination(position, width / 2, -90, { units: "meters" }).geometry.coordinates[0]!;
  const east = destination(position, width / 2, 90, { units: "meters" }).geometry.coordinates[0]!;
  const south = destination(position, height / 2, 180, { units: "meters" }).geometry
    .coordinates[1]!;
  const north = destination(position, height / 2, 0, { units: "meters" }).geometry.coordinates[1]!;
  return boundsPoints([
    { lng: west, lat: south },
    { lng: east, lat: south },
    { lng: east, lat: north },
  ]);
}

/** 将原生矩形按较长边调整为米制近似等边，保留中心；超出 10 公里拒绝。 */
export function squareFrom(points: readonly MapPoint[]): MapPoint[] {
  const [sw, , ne] = boundsPoints(points);
  if (!sw || !ne) throw new Error("矩形范围无效");
  const center = { lng: (sw.lng + ne.lng) / 2, lat: (sw.lat + ne.lat) / 2 };
  const width = distance([sw.lng, center.lat], [ne.lng, center.lat], { units: "meters" });
  const height = distance([center.lng, sw.lat], [center.lng, ne.lat], { units: "meters" });
  return rectangleAt(center, Math.max(width, height, 1), Math.max(width, height, 1));
}

/** 覆盖物与事件传递前复制几何，避免调用方或 iframe 共享可变坐标引用。 */
export function copyGeometry(geometry: MapGeometry): MapGeometry {
  if (geometry.kind === "multipolygon")
    return {
      kind: "multipolygon",
      polygons: geometry.polygons.map((polygon) =>
        polygon.map((ring) => ring.map((point) => ({ ...point })))
      ),
    };
  return geometry.kind === "circle"
    ? { ...geometry, center: { ...geometry.center } }
    : { ...geometry, points: geometry.points.map((point) => ({ ...point })) };
}

/** 将面转换为统一的片区/环结构，供两家 SDK 绘制；圆形没有线性环。 */
export function geometryPolygons(geometry: MapGeometry): MapPoint[][][] {
  if (geometry.kind === "circle") return [];
  return geometry.kind === "multipolygon" ? geometry.polygons : [[geometry.points]];
}

import AMapLoader from "@amap/amap-jsapi-loader";
import type {} from "@amap/amap-jsapi-types";
import type { MapGeometry, MapPoint, MapRuntimeOptions, MapSession, MapShape } from "../types";
import { amapPlaces, isPoint, waitFor } from "./helpers";
import { boundsPoints, squareFrom, geometryPolygons } from "../geometry";
import { MapServiceError } from "../key-pool";

/** 使用高德官方加载器、MouseTool 绘制工具和 SDK 类型，不再自行拼接脚本或维护顶点。 */
export async function mountAmap(
  host: HTMLElement,
  options: MapRuntimeOptions
): Promise<MapSession> {
  const { credential, onPoint, onGeometry } = options;
  window._AMapSecurityConfig = credential.serviceHost
    ? { serviceHost: credential.serviceHost }
    : { securityJsCode: credential.securityJsCode };
  await AMapLoader.load({
    key: credential.key,
    version: "2.0",
    plugins: ["AMap.PlaceSearch", "AMap.MouseTool", "AMap.PolygonEditor", "AMap.CircleEditor"],
  });
  const controller = new AbortController();
  const map = new AMap.Map(host.id, { zoom: 12, center: [116.397428, 39.90923] });
  const draw = new AMap.MouseTool(map);
  let overlay: AMap.Polygon | AMap.Circle | undefined;
  let editTool: AMap.PolygonEditor | AMap.CircleEditor | undefined;
  const closeEditor = () => {
    editTool?.close();
    editTool = undefined;
    overlay?.setOptions({ draggable: false });
  };
  let marker: AMap.Marker | undefined;
  let shape: MapShape = "polygon";
  /** 覆盖物点击继续交给地图，选点/绘制/只读的互斥由宿主统一判断。 */
  const style = { bubble: true, strokeColor: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.2 };
  const showGeometry = (geometry: MapGeometry | null, fit = false) => {
    closeEditor();
    overlay?.setMap(null);
    overlay = undefined;
    if (!geometry) return;
    if (geometry.kind === "circle") {
      overlay = new AMap.Circle({
        ...style,
        center: [geometry.center.lng, geometry.center.lat],
        radius: geometry.radius,
      });
    } else {
      overlay = new AMap.Polygon();
      overlay.setOptions({
        ...style,
        path:
          geometry.kind === "multipolygon"
            ? geometryPolygons(geometry).map((polygon) =>
                polygon.map((ring) => ring.map((point) => new AMap.LngLat(point.lng, point.lat)))
              )
            : geometry.points.map((point) => [point.lng, point.lat]),
      });
    }
    overlay.setMap(map);
    if (fit) map.setFitView([overlay]);
  };
  map.on("click", (event: unknown) => {
    if (typeof event === "object" && event !== null && "lnglat" in event && isPoint(event.lnglat))
      onPoint({ lng: event.lnglat.lng, lat: event.lnglat.lat });
  });
  draw.on("draw", (event: unknown) => {
    if (typeof event !== "object" || event === null || !("obj" in event)) return;
    try {
      let geometry: MapGeometry;
      if (event.obj instanceof AMap.Circle) {
        const center = event.obj.getCenter();
        const radius = event.obj.getRadius();
        if (!center || !radius || !Number.isFinite(radius)) throw new Error("圆形无效");
        geometry = { kind: "circle", center: { lng: center.lng, lat: center.lat }, radius };
      } else if (event.obj instanceof AMap.Rectangle) {
        const bounds = event.obj.getBounds();
        if (!bounds) throw new Error("矩形无效");
        const sw = bounds.getSouthWest(),
          ne = bounds.getNorthEast();
        const points = boundsPoints([sw, { lng: ne.lng, lat: sw.lat }, ne]);
        geometry = {
          kind: shape === "square" ? "square" : "rectangle",
          points: shape === "square" ? squareFrom(points) : points,
        };
      } else if (event.obj instanceof AMap.Polygon) {
        const path: unknown = event.obj.getPath();
        const points = Array.isArray(path)
          ? path.filter(isPoint).map((point) => ({ lng: point.lng, lat: point.lat }))
          : [];
        if (points.length < 3) throw new Error("顶点不足");
        geometry = { kind: "polygon", points };
      } else return;
      draw.close(true);
      showGeometry(geometry);
      onGeometry(geometry);
    } catch {
      draw.close(true);
      options.onDrawError("绘制未完成，请重试；正方形边长须在 1～10000 米内。");
    }
  });
  await waitFor(
    controller.signal,
    (resolve) => map.on("complete", () => resolve(true)),
    "高德底图加载超时"
  );
  return {
    destroy: () => {
      controller.abort();
      closeEditor();
      draw.close(true);
      map.destroy();
    },
    startDrawing: (nextShape) => {
      shape = nextShape;
      draw.close(true);
      if (shape === "circle") draw.circle(style);
      else if (shape === "rectangle" || shape === "square") draw.rectangle(style);
      else draw.polygon(style);
    },
    stopDrawing: () => draw.close(true),
    startEditing: () => {
      draw.close(true);
      closeEditor();
      if (!overlay) throw new Error("没有可编辑区域");
      overlay.setOptions({ draggable: true });
      editTool =
        overlay instanceof AMap.Circle
          ? new AMap.CircleEditor(map, overlay)
          : new AMap.PolygonEditor(map, overlay);
      editTool.open();
    },
    stopEditing: () => {
      if (!editTool || !overlay) return null;
      try {
        if (overlay instanceof AMap.Circle) {
          const center = overlay.getCenter(),
            radius = overlay.getRadius();
          if (!center || !radius || !Number.isFinite(radius) || radius <= 0)
            throw new Error("无效圆形");
          return { kind: "circle", center: { lng: center.lng, lat: center.lat }, radius };
        }
        const path: unknown = overlay.getPath();
        if (!Array.isArray(path) || path.length < 3 || !path.every(isPoint))
          throw new Error("无效多边形");
        return {
          kind: "polygon",
          points: path.map((point) => ({ lng: point.lng, lat: point.lat })),
        };
      } finally {
        closeEditor();
      }
    },
    showGeometry,
    focus: (point) => {
      marker?.setMap(null);
      marker = new AMap.Marker({ map, bubble: true, position: [point.lng, point.lat] });
      map.setZoomAndCenter(16, [point.lng, point.lat]);
    },
    search: (keyword, city) =>
      waitFor(
        controller.signal,
        (resolve, reject) => {
          new AMap.PlaceSearch({ city, pageSize: 10 }).search(keyword, (status, result) => {
            try {
              resolve(amapPlaces(status, result));
            } catch (error) {
              reject(error instanceof Error ? error : new MapServiceError("高德搜索失败"));
            }
          });
        },
        "高德搜索超时"
      ),
  };
}

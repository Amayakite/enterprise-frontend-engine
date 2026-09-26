import type {} from "tmap-gl-types";
import { destination } from "@turf/destination";
import type { MapGeometry, MapPoint, MapRuntimeOptions, MapSession, MapShape } from "../types";
import { squareFrom, geometryPolygons } from "../geometry";
import { isPoint } from "./helpers";

/**
 * 在 BaseMap 公开的初始化事件中接入官方几何工具。
 * Vue 包的 GeometryEditor 未暴露矩形图层，因此直接组合官方 SDK，复用一个编辑器而非反复重建。
 * @returns 区域显示、绘制和销毁端口；调用方在 BaseMap 卸载前销毁。
 */
export function createTencentDrawing(
  map: TMap.Map,
  options: MapRuntimeOptions
): Pick<
  MapSession,
  "showGeometry" | "startDrawing" | "stopDrawing" | "startEditing" | "stopEditing" | "destroy"
> {
  const style = { color: "rgba(37,99,235,0.2)", showBorder: true, borderColor: "#2563eb" };
  const polygon = new TMap.MultiPolygon({
    map,
    id: "completed-polygon",
    styles: { default: new TMap.PolygonStyle(style) },
    geometries: [],
  });
  const circle = new TMap.MultiCircle({
    map,
    id: "completed-circle",
    styles: { default: new TMap.CircleStyle(style) },
    geometries: [],
  });
  const drawPolygon = new TMap.MultiPolygon({
    map,
    id: "draw-polygon",
    styles: { default: new TMap.PolygonStyle(style) },
    geometries: [],
  });
  const drawCircle = new TMap.MultiCircle({
    map,
    id: "draw-circle",
    styles: { default: new TMap.CircleStyle(style) },
    geometries: [],
  });
  const drawRectangle = new TMap.MultiRectangle({
    map,
    id: "draw-rectangle",
    styles: { default: new TMap.RectangleStyle(style) },
    geometries: [],
  });
  const editor = new TMap.tools.GeometryEditor({
    map,
    overlayList: [
      { id: "completed-polygon", overlay: polygon },
      { id: "completed-circle", overlay: circle },
      { id: "polygon", overlay: drawPolygon },
      { id: "circle", overlay: drawCircle },
      { id: "rectangle", overlay: drawRectangle },
    ],
    activeOverlayId: "polygon",
    actionMode: TMap.tools.constants.EDITOR_ACTION.INTERACT,
    selectable: false,
    snappable: false,
  });
  let shape: MapShape = "polygon";
  let destroyed = false;
  let editingKind: "polygon" | "circle" | undefined;
  const latLng = (point: MapPoint) => new TMap.LatLng(point.lat, point.lng);
  const stopDrawing = () => {
    editor.stop();
    editor.setActionMode(TMap.tools.constants.EDITOR_ACTION.INTERACT);
    drawPolygon.setGeometries([]);
    drawCircle.setGeometries([]);
    drawRectangle.setGeometries([]);
  };
  const showGeometry = (geometry: MapGeometry | null, fit = false) => {
    polygon.setGeometries([]);
    circle.setGeometries([]);
    if (!geometry) return;
    const bounds = new TMap.LatLngBounds();
    if (geometry.kind === "circle") {
      circle.setGeometries([
        { id: "region", center: latLng(geometry.center), radius: geometry.radius },
      ]);
      if (fit)
        for (const bearing of [0, 90, 180, -90]) {
          const position = destination(
            [geometry.center.lng, geometry.center.lat],
            geometry.radius,
            bearing,
            { units: "meters" }
          ).geometry.coordinates;
          bounds.extend(new TMap.LatLng(position[1]!, position[0]!));
        }
    } else {
      const paths =
        geometry.kind === "multipolygon"
          ? geometryPolygons(geometry).map((part) => part.map((ring) => ring.map(latLng)))
          : geometry.points.map(latLng);
      polygon.setGeometries([{ id: "region", paths }]);
      if (fit)
        geometryPolygons(geometry)
          .flat(2)
          .forEach((point) => bounds.extend(latLng(point)));
    }
    if (fit) map.fitBounds(bounds, { padding: 60 });
  };
  editor.on("draw_complete", (value: unknown) => {
    if (destroyed || typeof value !== "object" || value === null) return;
    try {
      let geometry: MapGeometry;
      if (
        "center" in value &&
        isPoint(value.center) &&
        "radius" in value &&
        typeof value.radius === "number" &&
        Number.isFinite(value.radius) &&
        value.radius > 0
      ) {
        geometry = {
          kind: "circle",
          center: { lng: value.center.lng, lat: value.center.lat },
          radius: value.radius,
        };
      } else if (
        "center" in value &&
        isPoint(value.center) &&
        "width" in value &&
        "height" in value &&
        typeof value.width === "number" &&
        typeof value.height === "number" &&
        value.width > 0 &&
        value.height > 0
      ) {
        const bounds = TMap.MultiRectangle.getBounds({
          center: latLng(value.center),
          width: value.width,
          height: value.height,
        });
        const points = [
          bounds.getSouthWest(),
          bounds.getSouthEast(),
          bounds.getNorthEast(),
          bounds.getNorthWest(),
        ].map((point) => ({ lng: point.lng, lat: point.lat }));
        geometry = {
          kind: shape === "square" ? "square" : "rectangle",
          points: shape === "square" ? squareFrom(points) : points,
        };
      } else if ("paths" in value && Array.isArray(value.paths)) {
        const points = value.paths
          .filter(isPoint)
          .map((point) => ({ lng: point.lng, lat: point.lat }));
        if (points.length < 3) throw new Error("顶点不足");
        geometry = { kind: "polygon", points };
      } else throw new Error("图形无效");
      stopDrawing();
      showGeometry(geometry);
      options.onGeometry(geometry);
    } catch {
      stopDrawing();
      options.onDrawError("绘制未完成，请重试；正方形边长须在 1～10000 米内。");
    }
  });
  editor.on("draw_error", () => {
    stopDrawing();
    options.onDrawError("区域绘制失败，请检查形状后重试。");
  });
  return {
    showGeometry,
    stopDrawing,
    startEditing: () => {
      stopDrawing();
      editingKind = circle.getGeometries().length ? "circle" : "polygon";
      editor.setActiveOverlay(`completed-${editingKind}`);
      editor.setSelectable(true);
      editor.select(["region"]);
    },
    stopEditing: () => {
      if (!editingKind) return null;
      try {
        if (editingKind === "circle") {
          const value = circle.getGeometryById("region");
          if (
            !value ||
            !isPoint(value.center) ||
            !Number.isFinite(value.radius) ||
            value.radius <= 0
          )
            throw new Error("无效圆形");
          return {
            kind: "circle",
            center: { lng: value.center.lng, lat: value.center.lat },
            radius: value.radius,
          };
        }
        const value = polygon.getGeometryById("region");
        const paths: unknown = value?.paths;
        if (!Array.isArray(paths) || paths.length < 3 || !paths.every(isPoint))
          throw new Error("无效多边形");
        return {
          kind: "polygon",
          points: paths.map((point) => ({ lng: point.lng, lat: point.lat })),
        };
      } finally {
        editingKind = undefined;
        editor.stop();
        editor.select([]);
        editor.setSelectable(false);
      }
    },
    startDrawing: (nextShape) => {
      stopDrawing();
      shape = nextShape;
      editor.setActiveOverlay(shape === "square" ? "rectangle" : shape);
      editor.setActionMode(TMap.tools.constants.EDITOR_ACTION.DRAW);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      editor.destroy();
      for (const layer of [polygon, circle, drawPolygon, drawCircle, drawRectangle])
        layer.destroy();
    },
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { parseOsmBoundaries, createOsmBoundaryLoader } from "../src/api/maps/osm.ts";
import { copyGeometry } from "../src/components/common/MapViewer/geometry.ts";

const outer = [
  [116.4, 39.9],
  [116.41, 39.9],
  [116.41, 39.91],
  [116.4, 39.9],
];
const hole = [
  [116.402, 39.902],
  [116.403, 39.902],
  [116.403, 39.903],
  [116.402, 39.902],
];
const feature = (id, type, coordinates, properties = { name: "测试医院" }) => ({
  type: "Feature",
  id,
  properties,
  geometry: { type, coordinates },
});
const collection = (...features) => ({ type: "FeatureCollection", features });

test("OSM 原始轮廓转换为 GCJ-02，保留 OSM 标识且不替换为包围盒", () => {
  const [candidate] = parseOsmBoundaries(collection(feature("way/12", "Polygon", [outer])));
  assert.equal(candidate.geometry.kind, "polygon");
  assert.equal(candidate.geometry.points.length, 3);
  const first = candidate.geometry.points[0];
  assert.ok(Math.abs(first.lng - 116.406243) < 0.00001);
  assert.ok(Math.abs(first.lat - 39.901404) < 0.00001);
  assert.equal(candidate.sourceUrl, "https://www.openstreetmap.org/way/12");
  assert.equal(outer.length, 4);
});

test("多片/带洞区域完整保留，副本不共享内环坐标", () => {
  const [candidate] = parseOsmBoundaries(
    collection(feature("relation/9", "MultiPolygon", [[outer, hole], [outer]]))
  );
  assert.equal(candidate.geometry.kind, "multipolygon");
  assert.equal(candidate.geometry.polygons.length, 2);
  assert.equal(candidate.geometry.polygons[0].length, 2);
  const cloned = copyGeometry(candidate.geometry);
  cloned.polygons[0][1][0].lng = 0;
  assert.notEqual(candidate.geometry.polygons[0][1][0].lng, 0);
});

test("不将点、缺成员关系、未闭合或非法坐标冒充完整边界", () => {
  const data = collection(
    feature("way/1", "Point", [116, 40]),
    feature("way/2", "Polygon", [outer.slice(0, 3)]),
    feature("relation/3", "Polygon", [outer], { name: "缺数据", tainted: true }),
    feature("way/4", "Polygon", [
      [
        [NaN, 40],
        [1, 2],
        [2, 3],
        [NaN, 40],
      ],
    ]),
    feature("javascript:alert(1)", "Polygon", [outer])
  );
  assert.deepEqual(parseOsmBoundaries(data), []);
  assert.throws(() => parseOsmBoundaries({ elements: [] }));
  assert.throws(() => createOsmBoundaryLoader("https://example.com/search"));
  assert.throws(() => createOsmBoundaryLoader("//example.com/search"));
  assert.throws(() => createOsmBoundaryLoader("/\\example.com/search"));
});

test("通用地点候选先按名称排序再限量，不漏掉后返回的公司或园区", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { origin: "https://app.example" } };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const features = Array.from({ length: 25 }, (_, i) =>
    feature(`way/${i + 1}`, "Polygon", [outer], { name: `附近办公楼${i}` })
  );
  features.push(feature("way/999", "Polygon", [outer], { name: "中关村软件园" }));
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(collection(...features)), { status: 200 })
  );
  const load = createOsmBoundaryLoader("/api/maps/osm-boundaries");
  const candidates = await load({
    provider: "amap",
    place: { name: "中关村软件园", address: "", point: { lng: 116.4, lat: 39.9 } },
    signal: new AbortController().signal,
  });
  assert.equal(candidates.length, 20);
  assert.equal(candidates[0].id, "way/999");
});

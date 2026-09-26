import test from "node:test";
import assert from "node:assert/strict";
import { distance } from "@turf/distance";
import {
  rectangleAt,
  boundsPoints,
  squareFrom,
  copyGeometry,
} from "../src/components/common/MapViewer/geometry.ts";

test("估算尺寸以米计算，在不同纬度生成的矩形保持指定宽高", () => {
  for (const lat of [20, 40, 60]) {
    const points = rectangleAt({ lng: 116, lat }, 400, 200);
    const [sw, , ne] = points;
    assert.ok(Math.abs(distance([sw.lng, lat], [ne.lng, lat], { units: "meters" }) - 400) < 0.1);
    assert.ok(Math.abs(distance([116, sw.lat], [116, ne.lat], { units: "meters" }) - 200) < 0.1);
    assert.equal(points.length, 4);
    const square = squareFrom(points);
    const width = distance([square[0].lng, lat], [square[1].lng, lat], { units: "meters" });
    const height = distance([116, square[0].lat], [116, square[2].lat], { units: "meters" });
    assert.ok(Math.abs(width - height) < 0.1);
    assert.ok(Math.abs(width - 400) < 0.1);
  }
});

test("拒绝空尺寸、越界坐标和无面积范围；外接矩形覆盖全部有效轮廓点", () => {
  for (const value of [0, -1, NaN, Infinity, 10001])
    assert.throws(() => rectangleAt({ lng: 116, lat: 40 }, value, 200));
  assert.throws(() => rectangleAt({ lng: 116, lat: 89 }, 200, 200));
  assert.throws(() =>
    boundsPoints([
      { lng: 1, lat: 1 },
      { lng: 1, lat: 2 },
      { lng: 1, lat: 3 },
    ])
  );
  assert.throws(() =>
    boundsPoints([
      { lng: NaN, lat: 1 },
      { lng: 2, lat: 2 },
      { lng: 3, lat: 3 },
    ])
  );
  const input = [
    { lng: 116, lat: 40 },
    { lng: 117, lat: 42 },
    { lng: 118, lat: 41 },
  ];
  const result = boundsPoints(input);
  assert.deepEqual(result, [
    { lng: 116, lat: 40 },
    { lng: 118, lat: 40 },
    { lng: 118, lat: 42 },
    { lng: 116, lat: 42 },
  ]);
  assert.equal(input.length, 3);
});

test("输出圆形保留半径，几何副本不共享可变坐标", () => {
  const circle = { kind: "circle", center: { lng: 116, lat: 40 }, radius: 250 };
  const copy = copyGeometry(circle);
  copy.center.lng = 100;
  assert.equal(circle.center.lng, 116);
  assert.equal(copy.radius, 250);
  const polygon = { kind: "polygon", points: rectangleAt(circle.center, 200, 300) };
  const next = copyGeometry(polygon);
  next.points[0].lng = 1;
  assert.notEqual(polygon.points[0].lng, 1);
});

<template>
  <!-- 地图与标记复用腾讯官方 Vue 组件；绘制由公开初始化事件接入官方 SDK。 -->
  <BaseMap
    :api-key="options.credential.key"
    libraries="service,tools"
    :center="center"
    :zoom="zoom"
    :options="mapOptions"
    class="tencent-map"
    @map_inited="onMapReady"
    @click="onClick"
  >
    <MultiMarker v-if="marker" :geometries="[{ id: 'selected', position: marker }]" />
  </BaseMap>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { BaseMap, MultiMarker } from "tlbs-map-vue";
import type {} from "tmap-gl-types";
import type { MapPoint, MapRuntimeOptions, MapSession } from "../types";
import { createTencentDrawing } from "./tencent-drawing";
import { isPoint, tencentError, waitFor } from "./helpers";

const props = defineProps<{
  /** 宿主传入的单实例配置，不进入 URL。 */
  options: MapRuntimeOptions;
  /** 底图完成后交回业务端口，组件实例及 SDK 实例不穿透到业务页。 */
  ready: (session: MapSession) => void;
}>();
/** 声明式视野和覆盖物状态，由官方组件响应更新。 */
const center = ref<MapPoint>({ lng: 116.397428, lat: 39.90923 });
const zoom = ref(12);
const marker = ref<MapPoint>();
/** 绘制端口只创建一次；先于 BaseMap 销毁，避免工具遗留监听。 */
let drawingTools: ReturnType<typeof createTencentDrawing> | undefined;
const mapOptions = { viewMode: "2D" };
const controller = new AbortController();

/** 点击只发出业务坐标，绘制交给 GeometryEditor。 */
function onClick(event: unknown) {
  if (typeof event === "object" && event !== null && "latLng" in event && isPoint(event.latLng))
    props.options.onPoint({ lng: event.latLng.lng, lat: event.latLng.lat });
}
/** 使用官方初始化事件获得公开 map 参数，等待瓦片完成后报告就绪。 */
function onMapReady(map: TMap.Map) {
  map.on("tilesloaded", () => {
    if (controller.signal.aborted || drawingTools) return;
    drawingTools = createTencentDrawing(map, props.options);
    props.ready({
      ...drawingTools,
      destroy: () => {
        controller.abort();
        drawingTools?.destroy();
      },
      focus: (point) => {
        marker.value = point;
        center.value = point;
        zoom.value = 16;
      },
      search: (keyword, city) =>
        waitFor(
          controller.signal,
          (resolve, reject) => {
            void new TMap.service.Search({ pageSize: 10 })
              .searchRegion({ keyword, cityName: city })
              .then((result) => {
                if (result.status === 347) return resolve([]);
                if (result.status !== 0) return reject(tencentError(result));
                resolve(
                  result.data
                    .filter((poi) => isPoint(poi.location))
                    .map((poi) => ({
                      id: poi.id,
                      name: poi.title,
                      address: poi.address ?? "",
                      point: { lng: poi.location.lng, lat: poi.location.lat },
                    }))
                );
              })
              .catch((error: unknown) => {
                if (
                  typeof error === "object" &&
                  error !== null &&
                  "status" in error &&
                  Number(error.status) === 347
                )
                  resolve([]);
                else reject(tencentError(error));
              });
          },
          "腾讯搜索超时"
        ),
    });
  });
}
onBeforeUnmount(() => {
  controller.abort();
  drawingTools?.destroy();
});
</script>
<style scoped lang="scss">
.tencent-map {
  width: 100%;
  height: 100%;
}
</style>

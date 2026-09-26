<template>
  <main class="map-lab">
    <header>
      <h1>地图接入试用</h1>
      <p>搜索地点、点击取点，或使用地图自带工具绘制业务区域。</p>
    </header>
    <el-radio-group v-model="provider" aria-label="地图厂商">
      <el-radio-button value="amap">高德地图</el-radio-button>
      <el-radio-button value="tencent">腾讯地图</el-radio-button>
    </el-radio-group>
    <MyFeedback
      message="搜索并选中地点后可查找附近 OSM 场所边界，请核对候选场所。无数据时可手绘或估算，再编辑修正。OSM 数据不保证完整，结果尚未保存到后端。"
    />
    <MyFeedback v-if="configError" tone="error" :message="configError" />
    <section class="map-lab__output">
      <h2>业务表单选址体验</h2>
      <MapLocationPicker v-model="location" :provider="provider" />
    </section>
    <MapViewer
      :provider="provider"
      :credentials="credentials"
      :load-place-boundary="loadPlaceBoundary"
      @point="onPoint"
      @region="onRegion"
    />
    <section class="map-lab__output">
      <h2>当前取点与最近确认的区域</h2>
      <p v-if="point">
        GCJ-02：{{ point.lng.toFixed(6) }},
        {{ point.lat.toFixed(6) }}
      </p>
      <p v-else>尚未取点。配置 Key 后可直接在地图上操作。</p>
      <pre v-if="region">{{ JSON.stringify(region, null, 2) }}</pre>
    </section>
  </main>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import MapLocationPicker from "@/components/common/MapViewer/MapLocationPicker.vue";
import type { MapLocation } from "@/components/common/MapViewer/types";
import MapViewer from "@/components/common/MapViewer/MapViewer.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import { createOsmBoundaryLoader } from "@/api/maps/osm";
import { getMapCredentials } from "@/config/maps";
import type {
  MapCredential,
  MapPoint,
  MapProvider,
  MapRegion,
} from "@/components/common/MapViewer/types";

/** 浏览器仅访问同源接口；生产未配置时不提供在线 OSM 查询。 */
const endpoint =
  import.meta.env.VITE_OSM_BOUNDARY_URL ||
  (import.meta.env.DEV ? "/__map-data/osm-boundaries" : "");
const loadPlaceBoundary = endpoint ? createOsmBoundaryLoader(endpoint) : undefined;

/** 试用页选择的厂商，不跨厂商转换或复用坐标。 */
const provider = ref<MapProvider>("amap");
/** 与业务字段一致的已确认位置；取消弹窗不改写。 */
const location = ref<MapLocation | null>(null);
/** 仅从本地配置读取的凭证数组，页面不展示凭证值。 */
const credentials = ref<MapCredential[]>([]);
const configError = ref("");
/** 以下结果仅用于页面验证，刷新或切换厂商后清空。 */
const point = ref<MapPoint>();
const region = ref<MapRegion>();
function onPoint(value: { provider: MapProvider; point: MapPoint }) {
  point.value = value.point;
}
function onRegion(value: MapRegion) {
  region.value = value;
}
watch(
  provider,
  () => {
    location.value = null;
    point.value = undefined;
    region.value = undefined;
    configError.value = "";
    try {
      credentials.value = getMapCredentials(provider.value);
    } catch {
      credentials.value = [];
      configError.value = "地图配置格式错误：请检查本地环境变量是否为包含 key 的 JSON 对象数组。";
    }
  },
  { immediate: true }
);
</script>
<style scoped lang="scss">
.map-lab {
  padding: 20px;
  display: grid;
  gap: 16px;
  min-width: 0;
}
.map-lab h1 {
  font-size: 22px;
  margin: 0 0 8px;
}
.map-lab h2 {
  font-size: 16px;
}
.map-lab p {
  color: var(--el-text-color-secondary);
  margin: 0;
}
.map-lab__output {
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}
.map-lab pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 260px;
  overflow: auto;
}
@media (max-width: 720px) {
  .map-lab {
    padding: 12px;
  }
}
</style>

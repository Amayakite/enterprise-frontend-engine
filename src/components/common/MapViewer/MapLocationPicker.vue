<template>
  <!-- 表单内只显示摘要；确认弹窗后才回填值，关闭会丢弃本次临时选址。 -->
  <section class="location-picker">
    <div class="location-picker__summary">
      <el-icon :size="24" class="location-picker__icon"><Location /></el-icon>
      <div class="location-picker__identity">
        <strong>{{ modelValue?.place.name || "尚未设置位置" }}</strong>
        <p>
          {{
            modelValue?.place.address ||
            (modelValue ? "未填写详细地址" : "搜索任意地点或在地图上选点，也可维护业务区域。")
          }}
        </p>
        <div v-if="modelValue" class="location-picker__meta">
          <el-tag size="small" effect="plain">
            {{ modelValue.provider === "amap" ? "高德" : "腾讯" }}
          </el-tag>
          <el-tag size="small" :type="modelValue.region ? 'success' : 'info'">
            {{ regionLabel(modelValue) }}
          </el-tag>
          <el-text size="small" type="info">
            {{ modelValue.place.point.lng.toFixed(6) }},
            {{ modelValue.place.point.lat.toFixed(6) }} · GCJ-02
          </el-text>
        </div>
      </div>
    </div>
    <div class="location-picker__actions">
      <el-button :disabled="readonly && !modelValue" type="primary" plain @click="open">
        {{ readonly ? "查看地图" : modelValue ? "调整位置" : "选择位置" }}
      </el-button>
      <el-button
        v-if="modelValue && !readonly"
        link
        type="danger"
        @click="emit('update:modelValue', null)"
      >
        清除位置
      </el-button>
    </div>
    <MyDialog
      v-model="visible"
      :title="readonly ? '查看公司位置' : '维护公司位置'"
      width="1280px"
      fill-height
      body-scroll="content"
    >
      <div v-if="visible" class="location-picker__dialog">
        <MyFeedback v-if="configError" tone="error" :message="configError" />
        <MapViewer
          :provider="activeProvider"
          :credentials="credentials"
          :initial-location="initial"
          :mode="readonly ? 'view' : 'picker'"
          :load-place-boundary="loadBoundary"
          @selection="select"
          @busy="busy = $event"
        >
          <template #selection>
            <div v-if="draft" class="location-picker__labels">
              <template v-if="!readonly">
                <label>
                  位置名称
                  <el-input
                    v-model="name"
                    aria-label="位置名称"
                    maxlength="120"
                    placeholder="例如总部办公地点"
                  />
                </label>
                <label>
                  详细地址
                  <el-input
                    v-model="address"
                    aria-label="详细地址"
                    type="textarea"
                    :rows="2"
                    maxlength="300"
                    placeholder="补充楼栋、楼层、房间号"
                  />
                </label>
              </template>
              <el-text v-else>{{ address || "未填写详细地址" }}</el-text>
              <el-text size="small" type="info">{{ regionLabel(draft) }}</el-text>
            </div>
          </template>
        </MapViewer>
      </div>
      <template #footer>
        <div class="location-picker__footer">
          <div class="location-picker__selection" role="status">
            <strong>{{ draft ? name || draft.place.name : "尚未选择地点" }}</strong>
            <span>{{ draft ? regionLabel(draft) : "搜索地点，或直接在地图上选点" }}</span>
          </div>
          <div class="location-picker__actions">
            <el-button @click="visible = false">{{ readonly ? "关闭" : "取消" }}</el-button>
            <el-button
              v-if="!readonly"
              type="primary"
              :disabled="busy || !draft || !name.trim()"
              @click="confirm"
            >
              使用此位置
            </el-button>
          </div>
        </div>
      </template>
    </MyDialog>
  </section>
</template>
<script setup lang="ts">
import { ref, shallowRef, onDeactivated } from "vue";
import type { DeepReadonly } from "vue";
import { Location } from "@element-plus/icons-vue";
import MyDialog from "@/components/common/MyDialog.vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import MapViewer from "./MapViewer.vue";
import { cloneReadonlyModel, cloneModel } from "@/components/business/fields/model";
import { getDefaultMapProvider, getMapCredentials } from "@/config/maps";
import { createOsmBoundaryLoader } from "@/api/maps/osm";
import type { MapLocation, MapProvider, MapCredential, MapViewerProps } from "./types";
const props = withDefaults(
  defineProps<{
    /** 已确认位置；null 表示未设置。仅确认弹窗或清除时触发回填。 */
    modelValue: DeepReadonly<MapLocation> | null;
    /** 默认 false；true 只展示已存位置，不提供搜索、绘制和回填。 */
    readonly?: boolean;
    /** 可覆盖默认 OSM 查询，输入厂商/地点/signal，返回 GCJ-02 候选；失败由地图页内反馈。
     * @example
     * <MapLocationPicker :load-place-boundary="fetchAuthorizedBoundary" />
     */
    loadPlaceBoundary?: MapViewerProps["loadPlaceBoundary"];
    /** 新选址厂商，省略读取 VITE_MAP_PROVIDER（默认高德）；已有位置按原厂商回显。 */
    provider?: MapProvider;
  }>(),
  { readonly: false }
);
const emit = defineEmits<{
  /** 确认或清除后返回独立位置副本；接入 MyCRUD 时调用字段 update 后 commit。
   * @example
   * <MapLocationPicker :model-value="value" @update:model-value="value => { update(value); commit(); }" />
   */
  "update:modelValue": [value: MapLocation | null];
}>();
/** 每次打开重新复制输入，弹窗内编辑不会污染表单和只读详情。 */
const visible = ref(false);
const initial = shallowRef<MapLocation | null>(null);
const draft = shallowRef<MapLocation | null>(null);
const activeProvider = ref<MapProvider>("amap");
const credentials = shallowRef<MapCredential[]>([]);
const configError = ref("");
const busy = ref(true);
const name = ref("");
const address = ref("");
/** 同源边界服务由环境配置；生产未配置则隐藏在线边界查询。 */
const endpoint =
  import.meta.env.VITE_OSM_BOUNDARY_URL ||
  (import.meta.env.DEV ? "/__map-data/osm-boundaries" : "");
const loadBoundary = shallowRef<MapViewerProps["loadPlaceBoundary"]>();
/** 简短说明区域形态与来源，用户不用理解几何 JSON。 */
function regionLabel(value: DeepReadonly<MapLocation>) {
  const region = value.region;
  if (!region) return "仅点位 · 未设置区域";
  const geometry = region.geometry;
  const shape =
    geometry.kind === "circle"
      ? `圆形 ${Math.round(geometry.radius)} 米`
      : geometry.kind === "multipolygon"
        ? `${geometry.polygons.length} 片区域`
        : "已设置区域";
  const source =
    region.source === "estimate" ? "估算" : region.source === "boundary" ? "来源边界" : "手绘";
  return `${shape} · ${source}${region.modified ? " · 已修订" : ""}`;
}
/** 打开时才读取凭证并挂载地图，未打开的列表/表单不加载 SDK。 */
function open() {
  initial.value = cloneReadonlyModel<MapLocation | null>(props.modelValue);
  draft.value = cloneModel(initial.value);
  name.value = draft.value?.place.name ?? "";
  address.value = draft.value?.place.address ?? "";

  busy.value = true;
  configError.value = "";
  try {
    activeProvider.value = initial.value?.provider ?? props.provider ?? getDefaultMapProvider();
    credentials.value = getMapCredentials(activeProvider.value);
  } catch {
    credentials.value = [];
    configError.value = "地图配置格式不正确，请联系管理员检查凭证数组。";
  }
  loadBoundary.value = props.loadPlaceBoundary;
  if (!loadBoundary.value && endpoint) {
    try {
      loadBoundary.value = createOsmBoundaryLoader(endpoint);
    } catch {
      configError.value = "边界查询地址配置不正确；仍可选点、手绘或估算区域。";
    }
  }
  visible.value = true;
}
/** 仅地点改变时替换用户可补充的名称/地址，区域编辑不清空已输入文字。 */
function select(value: MapLocation | null) {
  if (props.readonly) return;
  const previous = draft.value?.place;
  if (
    !previous ||
    previous.id !== value?.place.id ||
    previous.point.lng !== value?.place.point.lng ||
    previous.point.lat !== value?.place.point.lat
  ) {
    name.value = value?.place.name ?? "";
    address.value = value?.place.address ?? "";
  }
  draft.value = value;
}
/** 单次确认回填；地图操作未结束时禁止提交中间形态。 */
function confirm() {
  if (props.readonly || busy.value || !draft.value || !name.value.trim()) return;
  const value = cloneModel(draft.value);
  value.place.name = name.value.trim();
  value.place.address = address.value.trim();
  emit("update:modelValue", value);
  visible.value = false;
}
/** 缓存页面切走即关闭弹窗和地图，保留已确认表单值。 */
onDeactivated(() => {
  visible.value = false;
});
</script>
<style scoped lang="scss">
.location-picker {
  width: 100%;
  padding: 18px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-blank);
  display: grid;
  gap: 16px;
  &__summary {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  &__icon {
    color: var(--el-color-primary);
    flex-shrink: 0;
    margin-top: 2px;
  }
  &__identity {
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.6;
  }
  p {
    margin: 4px 0 10px;
    color: var(--el-text-color-secondary);
  }
  &__meta,
  &__actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }
  &__dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 0;
    > .map-viewer {
      flex: 1;
    }
  }
  &__selection {
    display: grid;
    gap: 4px;
    min-width: 0;
    text-align: left;
    strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    span {
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }
  }
  &__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
  &__labels {
    display: grid;
    gap: 14px;
    label {
      display: grid;
      gap: 8px;
      font-size: 13px;
    }
  }
  @media (max-width: 760px) {
    &__footer {
      flex-wrap: wrap;
    }
    &__selection {
      flex: 1 1 100%;
    }
    &__actions {
      margin-left: auto;
    }
  }
}
</style>

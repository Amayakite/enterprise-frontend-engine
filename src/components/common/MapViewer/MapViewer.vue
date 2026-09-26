<template>
  <!-- 固定地图与任务侧栏；侧栏独立滚动，操作不会把地图挤出视口。 -->
  <section
    class="map-viewer"
    :class="{
      'map-viewer--embedded': mode === 'picker' || mode === 'view',
      'map-viewer--mobile-map': mobileMap,
    }"
  >
    <el-button class="map-viewer__mobile-switch" type="primary" @click="mobileMap = !mobileMap">
      {{ mobileMap ? "返回操作面板" : "查看地图" }}
    </el-button>
    <aside class="map-viewer__sidebar">
      <div class="map-viewer__panel-heading">
        <h3>{{ mode === "view" ? "位置详情" : "公司在哪里？" }}</h3>
        <p>
          {{
            mode === "view"
              ? "查看已确认的地点与业务范围"
              : "先找到地点，需要时再为它设置业务范围。"
          }}
        </p>
        <el-segmented
          v-if="mode !== 'view'"
          v-model="activePanel"
          block
          :options="[
            { label: '选择地点', value: 'place' },
            { label: '设置区域', value: 'region', disabled: mode === 'picker' && !selectedPlace },
          ]"
          :disabled="drawing || editing || generating"
          aria-label="地图操作"
        />
      </div>
      <div class="map-viewer__panel-scroll">
        <div class="map-viewer__panel-content">
          <MyFeedback v-if="!keys.length" message="地图服务尚未配置，请联系管理员。" />
          <MyFeedback v-if="error" tone="error" :message="error">
            <el-button v-if="keyError" :disabled="loading || searching" @click="restart">
              重新加载
            </el-button>
          </MyFeedback>
          <template v-if="activePanel === 'place' || mode === 'view'">
            <form
              v-if="mode !== 'view' && showResults"
              class="map-viewer__search"
              @submit.prevent="searchPlaces"
            >
              <label class="map-viewer__label">搜索城市</label>
              <el-input
                v-model="city"
                aria-label="搜索城市"
                placeholder="例如北京市"
                :disabled="!ready || searching"
              />
              <label class="map-viewer__label">地点名称</label>
              <el-input
                v-model="keyword"
                aria-label="搜索地点"
                placeholder="公司、园区、楼宇、医院…"
                clearable
                :disabled="!ready || searching"
              />
              <el-button
                type="primary"
                native-type="submit"
                :disabled="!ready || !keyword.trim()"
                :loading="searching"
              >
                搜索地点
              </el-button>
            </form>
            <div v-if="selectedPlace && !showResults" class="map-viewer__selected">
              <span class="map-viewer__eyebrow">已选地点</span>
              <strong>{{ selectedPlace.name }}</strong>
              <span v-if="mode === 'view'">{{ selectedPlace.address || "未填写详细地址" }}</span>
              <el-button
                v-if="mode !== 'view'"
                link
                type="primary"
                :disabled="!ready"
                @click="beginPointSelection"
              >
                在地图上重新选点
              </el-button>
            </div>
            <slot v-if="!showResults || mode === 'view'" name="selection" />
            <div
              v-if="showResults && (results.length || searched)"
              class="map-viewer__results"
              aria-label="地点搜索结果"
            >
              <span class="map-viewer__eyebrow">搜索结果 · {{ results.length }}</span>
              <el-empty
                v-if="!results.length"
                :image-size="50"
                description="没有找到地点，请换个关键词"
              />
              <el-button
                v-for="(place, index) in results"
                :key="place.id || index"
                class="map-viewer__result"
                :class="{
                  'map-viewer__result--selected':
                    selectedPlace?.point.lng === place.point.lng &&
                    selectedPlace?.point.lat === place.point.lat,
                }"
                :disabled="!ready || generating"
                @click="focusResult(index)"
              >
                <span class="map-viewer__result-content">
                  <strong>{{ place.name }}</strong>
                  <span>{{ place.address || "暂无地址" }}</span>
                </span>
              </el-button>
            </div>
            <el-button
              v-if="selectedPlace && mode !== 'view'"
              link
              type="primary"
              @click="showResults = !showResults"
            >
              {{ showResults ? "返回已选地点" : "重新搜索地点" }}
            </el-button>
            <div v-if="!selectedPlace && !searched" class="map-viewer__empty-hint">
              也可以直接在右侧地图上单击，选择一个位置。
            </div>
          </template>
          <template v-else>
            <template v-if="regionConfig && !editing">
              <label class="map-viewer__label">选择范围设置方式</label>
              <el-select
                v-model="regionMethod"
                aria-label="范围设置方式"
                :disabled="drawing || editing || generating"
              >
                <el-option label="查找已有边界" value="boundary" />
                <el-option label="按距离生成" value="estimate" />
                <el-option label="在地图上绘制" value="draw" />
              </el-select>
              <template v-if="regionMethod === 'boundary'">
                <p class="map-viewer__hint">
                  从附近场所中选择轮廓，请在地图上核对。没有合适的边界时，可按距离生成或自己绘制。
                </p>
                <el-button
                  v-if="loadPlaceBoundary"
                  type="primary"
                  :disabled="!ready || !selectedPlace || searching || editing"
                  :loading="generating"
                  @click="generateBoundary"
                >
                  查找地点边界
                </el-button>
                <MyFeedback v-else message="当前未配置边界查询服务，可按距离生成或在地图上绘制。" />
                <el-text v-if="!selectedPlace" type="info">请先在“选择地点”中选一个位置。</el-text>
                <div
                  v-if="boundaryCandidates.length"
                  class="map-viewer__results"
                  aria-label="地点边界候选"
                >
                  <el-button
                    v-for="(candidate, index) in boundaryCandidates"
                    :key="candidate.id"
                    class="map-viewer__result"
                    :disabled="editing || generating"
                    @click="selectBoundary(index)"
                  >
                    <span class="map-viewer__result-content">
                      <strong>{{ candidate.name }}</strong>
                      <span>
                        {{
                          draft?.boundary?.id === candidate.id
                            ? "已使用此边界"
                            : "点击查看并使用轮廓"
                        }}
                      </span>
                    </span>
                  </el-button>
                </div>
              </template>
              <template v-else>
                <label class="map-viewer__label">区域形状</label>
                <el-select
                  v-model="shape"
                  aria-label="区域形状"
                  :disabled="drawing || generating || editing"
                >
                  <el-option v-if="regionMethod === 'draw'" label="多边形" value="polygon" />
                  <el-option label="圆形" value="circle" />
                  <el-option label="长方形" value="rectangle" />
                  <el-option label="正方形" value="square" />
                </el-select>
                <template v-if="regionMethod === 'estimate'">
                  <div class="map-viewer__dimensions">
                    <label>
                      {{
                        shape === "circle"
                          ? "半径（米）"
                          : shape === "square"
                            ? "边长（米）"
                            : "宽度（米）"
                      }}
                      <el-input-number
                        v-if="shape === 'circle'"
                        v-model="radius"
                        aria-label="估算半径"
                        :min="1"
                        :max="10000"
                        :precision="0"
                        controls-position="right"
                        class="map-viewer__dimension-input"
                      />
                      <el-input-number
                        v-else
                        v-model="width"
                        aria-label="估算宽度"
                        :min="1"
                        :max="10000"
                        :precision="0"
                        controls-position="right"
                        class="map-viewer__dimension-input"
                      />
                    </label>
                    <label v-if="shape === 'rectangle'">
                      高度（米）
                      <el-input-number
                        v-model="height"
                        aria-label="估算高度"
                        :min="1"
                        :max="10000"
                        :precision="0"
                        controls-position="right"
                        class="map-viewer__dimension-input"
                      />
                    </label>
                  </div>
                  <p class="map-viewer__hint">以所选地点为中心生成近似范围，之后可以拖动调整。</p>
                  <el-button
                    type="primary"
                    :disabled="!ready || !selectedPlace || generating || searching || editing"
                    @click="generateEstimate"
                  >
                    生成区域
                  </el-button>
                </template>
                <template v-else>
                  <p class="map-viewer__hint">{{ drawingHint }}</p>
                  <el-button
                    type="primary"
                    :disabled="!ready || searching || generating || editing"
                    @click="toggleDrawing"
                  >
                    {{ drawing ? "取消绘制" : "开始绘制" }}
                  </el-button>
                </template>
              </template>
              <el-button v-if="draft && !drawing && !generating" link @click="regionConfig = false">
                返回当前区域
              </el-button>
            </template>
            <div v-if="draft && (!regionConfig || editing)" class="map-viewer__region-summary">
              <span class="map-viewer__eyebrow">当前区域</span>
              <strong>{{ selectedPlace?.name || "手绘范围" }}</strong>
              <strong>{{ draftSummary }}</strong>
              <span>{{ sourceLabels[draft.source] }}</span>
              <el-select
                v-if="draft.geometry.kind === 'multipolygon'"
                v-model="editRingKey"
                aria-label="编辑轮廓"
                :disabled="editing"
              >
                <el-option
                  v-for="ring in editableRings"
                  :key="ring.key"
                  :value="ring.key"
                  :label="ring.label"
                />
              </el-select>
              <div class="map-viewer__tools">
                <template v-if="editing">
                  <el-button type="primary" @click="finishEditing(true)">应用调整</el-button>
                  <el-button @click="finishEditing(false)">取消调整</el-button>
                </template>
                <template v-else>
                  <el-button :disabled="!ready || drawing || generating" @click="startEditing">
                    调整轮廓
                  </el-button>
                  <el-button
                    link
                    type="danger"
                    :disabled="drawing || generating"
                    @click="clearRegion"
                  >
                    移除区域
                  </el-button>
                </template>
              </div>
              <el-text v-if="editing" type="info" size="small">
                拖动轮廓或控制点；矩形与正方形调整后按多边形保存。
              </el-text>
              <el-button
                v-if="!editing"
                :disabled="drawing || generating"
                @click="regionConfig = true"
              >
                重新设置区域
              </el-button>
              <el-button
                v-if="mode !== 'picker'"
                :disabled="!ready || drawing || generating || editing"
                @click="confirmRegion"
              >
                确认区域
              </el-button>
            </div>
          </template>
        </div>
      </div>
    </aside>
    <div class="map-viewer__stage">
      <div class="map-viewer__map-hint" role="status">
        {{
          loading
            ? "正在加载地图…"
            : !ready
              ? "地图未就绪"
              : editing
                ? "拖动控制点调整区域，完成后点击“应用调整”"
                : drawing
                  ? drawingHint
                  : mode === "view"
                    ? "已保存的位置与范围"
                    : picking
                      ? "单击地图选点 · 拖动地图查看附近"
                      : "区域已保留 · 可拖动地图查看"
        }}
      </div>
      <div
        ref="container"
        v-loading="loading"
        element-loading-text="正在加载地图…"
        class="map-viewer__canvas"
        :aria-busy="loading"
      >
        <el-empty v-if="!loading && !ready" description="地图未就绪" />
      </div>
      <div v-if="editing" class="map-viewer__mobile-edit">
        <el-button type="primary" @click="finishEditing(true)">应用调整</el-button>
        <el-button @click="finishEditing(false)">取消调整</el-button>
      </div>
      <!-- TODO：产品统一署名页面上线后接入 OSM 来源说明，边界来源与原始几何继续保留在数据中。 -->
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import MyFeedback from "@/components/business/feedback/MyFeedback.vue";
import { cloneModel } from "@/components/business/fields/model";
import { createMapSession } from "./adapter";
import { MapServiceError, normalizeCredentials, tryMapCredentials } from "./key-pool";
import { copyGeometry, rectangleAt } from "./geometry";
import type {
  MapBoundaryCandidate,
  MapDraft,
  MapGeometry,
  MapPlace,
  MapPoint,
  MapSession,
  MapShape,
  MapViewerEmits,
  MapViewerProps,
} from "./types";

const props = defineProps<MapViewerProps>();
const emit = defineEmits<MapViewerEmits>();
/** 选址默认只显示搜索，区域工具由用户按需展开。 */
const activePanel = ref("place");
/** 窄屏切换操作与地图，避免把两块内容压缩到不可操作。 */
const mobileMap = ref(false);
/** 已有区域时只显示结果；重新设置才展开生成工具。 */
const regionConfig = ref(true);
/** 选择后收起结果，切换地点时可重新展开。 */
const showResults = ref(true);
/** 每次只显示一种区域操作，降低首次使用时的选择负担。 */
const regionMethod = ref("boundary");
watch(regionMethod, (method) => {
  if (method === "estimate" && shape.value === "polygon") shape.value = "circle";
});
/** 区域操作后关闭取点，避免官方绘制完成同一手势的 click 覆盖刚完成的区域。 */
const picking = ref(true);
/** 地图宿主；SDK 及凭证隔离在内部 iframe。 */
const container = ref<HTMLDivElement>();
/** 清理后的数组按配置顺序尝试；不写入全局存储或持久黑名单。 */
const keys = computed(() => normalizeCredentials(props.credentials));
/** 当前 SDK 会话不进入深层响应式代理。 */
const session = shallowRef<MapSession>();
/** 当前加载周期控制器；换厂商、换配置和卸载均取消旧回调。 */
let controller = new AbortController();
/** 以下状态描述本组件的加载和搜索交互，不暴露实际 Key。 */
const loading = ref(false);
const searching = ref(false);
const activeIndex = ref(0);
const error = ref("");
/** 仅凭证/加载故障提供 Key 重试，尺寸及绘制错误不引导用户重载地图。 */
const keyError = ref(false);
const keyword = ref("");
/** 两家搜索使用同一显式城市，默认北京市，避免依赖厂商的默认地域。 */
const city = ref("北京市");
const results = ref<MapPlace[]>([]);
const searched = ref(false);
/** 手绘草稿在同厂商 Key 故障切换时保留，换厂商时清空。 */
const drawing = ref(false);
const draft = shallowRef<MapDraft>();
/** 编辑期间原草稿作为取消快照，仅应用时更新；候选必须由用户显式选择。 */
const editing = ref(false);
/** 多片/带洞区域逐环交给官方编辑器，应用时只替换选中环，不丢失其它几何。 */
const editRingKey = ref("0:0");
let activeEditRing: { part: number; ring: number } | undefined;
const editableRings = computed(() => {
  const geometry = draft.value?.geometry;
  if (geometry?.kind !== "multipolygon") return [];
  return geometry.polygons.flatMap((part, partIndex) =>
    part.map((_, ringIndex) => ({
      key: `${partIndex}:${ringIndex}`,
      label: `片区 ${partIndex + 1} · ${ringIndex === 0 ? "外轮廓" : `内洞 ${ringIndex}`}`,
    }))
  );
});
const boundaryCandidates = shallowRef<MapBoundaryCandidate[]>([]);
/** 所选地点和生成尺寸只影响下一次生成，不暗中改写已确认的区域。 */
const selectedPlace = ref<MapPlace>();
const shape = ref<MapShape>("polygon");
const width = ref<number | undefined>(400);
const height = ref<number | undefined>(300);
const radius = ref<number | undefined>(200);
const generating = ref(false);
let boundaryController: AbortController | undefined;
const sourceLabels = {
  manual: "手绘区域",
  estimate: "估算区域，请核对",
  boundary: "来源边界，请核对",
};
const draftSummary = computed(() => {
  const geometry = draft.value?.geometry;
  if (geometry?.kind === "multipolygon") return `${geometry.polygons.length} 片区域`;
  return geometry?.kind === "circle"
    ? `圆形 · 半径 ${geometry.radius.toFixed(1)} 米`
    : `${geometry?.points.length ?? 0} 个顶点`;
});
const drawingHint = computed(() => {
  if (shape.value === "polygon") return "单击添加顶点，双击完成绘制";
  const hint =
    props.provider === "amap" ? "按下鼠标拖动，松开完成" : "单击起点，移动鼠标，双击完成";
  return shape.value === "square" ? `${hint}；完成后按较长边调整为等边` : hint;
});
const ready = computed(() => Boolean(session.value) && !loading.value);

/** 点击地图发出坐标事件，不修改官方绘制工具的状态或自动保存。 */
function onPoint(point: MapPoint) {
  if (props.mode === "view" || drawing.value || editing.value || generating.value) return;
  if (props.mode === "picker") {
    if (!picking.value) return;
    clearRegion();
    showResults.value = false;
    selectedPlace.value = { name: "地图选点", address: "", point: { ...point } };
    session.value?.focus(point);
  }
  emit("point", { provider: props.provider, point });
}

/** 官方工具完成后复制草稿；鼠标移动过程中不触发 Vue 深层几何更新。 */
function onGeometry(value: MapGeometry) {
  regionConfig.value = false;
  picking.value = false;
  draft.value = { geometry: copyGeometry(value), source: "manual" };
  drawing.value = false;
}

/** 终止过期边界查询，防止晚到的结果覆盖新草稿。 */
function cancelBoundary() {
  boundaryCandidates.value = [];
  boundaryController?.abort();
  boundaryController = undefined;
  generating.value = false;
}

/** 从指定数组下标开始加载，失败容器由适配器销毁；每项本轮最多尝试一次。 */
async function loadFrom(start: number, signal: AbortSignal) {
  session.value?.destroy();
  session.value = undefined;
  loading.value = true;
  const host = container.value;
  if (!host) throw new Error("地图容器尚未挂载");
  try {
    const next = await tryMapCredentials(
      keys.value.slice(start),
      async (credential, offset) => {
        activeIndex.value = start + offset;
        return createMapSession(
          host,
          props.provider,
          credential,
          signal,
          (point) => {
            if (!signal.aborted) onPoint(point);
          },
          (value) => {
            if (!signal.aborted) onGeometry(value);
          },
          (message) => {
            if (!signal.aborted) {
              keyError.value = false;
              error.value = message;
              drawing.value = false;
            }
          }
        );
      },
      signal
    );
    if (signal.aborted) {
      next.destroy();
      return;
    }
    session.value = next;
    if (selectedPlace.value) next.focus(selectedPlace.value.point);
    next.showGeometry(draft.value?.geometry ?? null, true);
  } finally {
    if (!signal.aborted) loading.value = false;
  }
}

/** 用户重试重新允许所有 Key；不把网络超时、配额耗尽永久记录为坏 Key。 */
async function restart() {
  finishEditing(false);
  cancelBoundary();
  drawing.value = false;
  controller.abort();
  controller = new AbortController();
  const { signal } = controller;
  session.value?.destroy();
  session.value = undefined;
  error.value = "";
  keyError.value = false;
  results.value = [];
  searched.value = false;
  loading.value = false;
  searching.value = false;
  if (!keys.value.length || !container.value) return;
  try {
    await loadFrom(0, signal);
  } catch {
    if (!signal.aborted) {
      keyError.value = true;
      error.value = "所有 Key 均未能加载地图。请检查网络、WebGL、域名白名单和凭证配置。";
    }
  }
}

/** 搜索失败仅在明确凭证/权限/额度错误时换下一项，普通网络错误由用户重试。 */
async function searchPlaces() {
  if (!ready.value || searching.value || !keyword.value.trim()) return;
  const { signal } = controller;
  const query = keyword.value.trim();
  finishEditing(false);
  cancelBoundary();
  session.value?.stopDrawing();
  drawing.value = false;
  showResults.value = true;
  searching.value = true;
  searched.value = false;
  results.value = [];
  error.value = "";
  keyError.value = false;
  try {
    while (session.value && !signal.aborted) {
      try {
        const places = await session.value.search(query, city.value.trim() || "北京市");
        if (signal.aborted) return;
        results.value = places;
        searched.value = true;
        return;
      } catch (cause) {
        if (signal.aborted) return;
        if (!(cause instanceof MapServiceError) || cause.kind !== "credential") throw cause;
        if (activeIndex.value + 1 >= keys.value.length)
          throw new MapServiceError(
            `${cause.message}。所有剩余 Key 均无法完成搜索，请检查服务权限和额度`,
            "credential"
          );
        await loadFrom(activeIndex.value + 1, signal);
      }
    }
  } catch (cause) {
    if (!signal.aborted) {
      keyError.value = cause instanceof MapServiceError && cause.kind === "credential";
      error.value = cause instanceof MapServiceError ? cause.message : "搜索失败，请稍后重试";
    }
  } finally {
    if (!signal.aborted) searching.value = false;
  }
}

/** 选中搜索结果供自动生成使用，并定位；保留已有草稿直到用户明确生成新区域。 */
function focusResult(index: number) {
  const place = results.value[index];
  if (!place) return;
  finishEditing(false);
  cancelBoundary();
  session.value?.stopDrawing();
  drawing.value = false;
  if (props.mode === "picker") clearRegion();
  selectedPlace.value = place;
  showResults.value = false;
  mobileMap.value = true;
  session.value?.focus(place.point);
}
/** 以所选地点为中心生成指定尺寸的区域；无任何额外地图网络请求。 */
function generateEstimate() {
  const place = selectedPlace.value;
  if (!place || !session.value) return;
  keyError.value = false;
  try {
    let geometry: MapGeometry;
    if (shape.value === "circle") {
      if (
        !radius.value ||
        !Number.isFinite(radius.value) ||
        radius.value < 1 ||
        radius.value > 10000
      )
        throw new Error("半径须为 1～10000 米");
      geometry = { kind: "circle", center: { ...place.point }, radius: radius.value };
    } else {
      const size = width.value ?? 0;
      geometry = {
        kind: shape.value === "square" ? "square" : "rectangle",
        points: rectangleAt(
          place.point,
          size,
          shape.value === "square" ? size : (height.value ?? 0)
        ),
      };
    }
    cancelBoundary();
    session.value.stopDrawing();
    session.value.showGeometry(geometry, true);
    drawing.value = false;
    regionConfig.value = false;
    mobileMap.value = true;
    draft.value = { geometry, source: "estimate", place: { ...place, point: { ...place.point } } };
    error.value = "";
    keyError.value = false;
  } catch {
    error.value = "请输入 1～10000 米的有效尺寸；暂不支持南北纬 80 度以外的估算。";
  }
}
/** 查询业务提供的已授权边界；无数据或失败都保留旧草稿，绝不冒充真实范围。 */
async function generateBoundary() {
  const place = selectedPlace.value;
  if (!place || !props.loadPlaceBoundary || !session.value || generating.value) return;
  cancelBoundary();
  const request = new AbortController();
  boundaryController = request;
  generating.value = true;
  error.value = "";
  keyError.value = false;
  session.value.stopDrawing();
  drawing.value = false;
  const timeout = setTimeout(() => {
    if (boundaryController !== request) return;
    cancelBoundary();
    error.value = "场所范围查询超时，请重试。";
  }, 15000);
  try {
    const candidates = await props.loadPlaceBoundary({
      provider: props.provider,
      place: { ...place, point: { ...place.point } },
      signal: request.signal,
    });
    if (request.signal.aborted) return;
    boundaryCandidates.value = [...candidates];
    if (!candidates.length) error.value = "附近没有可用地点轮廓，可继续手绘或估算。";
  } catch {
    if (!request.signal.aborted)
      error.value = "场所范围读取失败或返回范围无效，请检查服务权限及数据。";
  } finally {
    clearTimeout(timeout);
    if (boundaryController === request) {
      generating.value = false;
      boundaryController = undefined;
    }
  }
}
/** 使用显式选中的原始轮廓，保留来源信息及完整几何，暂不自动匹配同名地点。 */
function selectBoundary(index: number) {
  const candidate = boundaryCandidates.value[index];
  if (!candidate || !session.value || editing.value) return;
  session.value.stopDrawing();
  drawing.value = false;
  regionConfig.value = false;
  mobileMap.value = true;
  const geometry = copyGeometry(candidate.geometry);
  editRingKey.value = "0:0";
  session.value.showGeometry(geometry, true);
  draft.value = {
    geometry,
    source: "boundary",
    place: selectedPlace.value,
    boundary: { ...candidate, geometry: copyGeometry(candidate.geometry) },
  };
  error.value = "";
  keyError.value = false;
}
/** 打开官方编辑器；复杂区域一次编辑所选环，保留其它片区和内洞。 */
function startEditing() {
  if (!draft.value || !session.value) return;
  cancelBoundary();
  error.value = "";
  keyError.value = false;
  try {
    activeEditRing = undefined;
    if (draft.value.geometry.kind === "multipolygon") {
      const [part, ring] = editRingKey.value.split(":").map(Number);
      const points = draft.value.geometry.polygons[part]?.[ring];
      if (!points) throw new Error("请选择有效轮廓");
      activeEditRing = { part, ring };
      session.value.showGeometry({ kind: "polygon", points }, true);
    }
    mobileMap.value = true;
    session.value.startEditing();
    editing.value = true;
  } catch {
    session.value.showGeometry(draft.value.geometry);
    activeEditRing = undefined;
    error.value = "无法启动区域编辑，请重试。";
  }
}
/** 应用编辑器结果或恢复原草稿；取消、切换、清空均可调用，未编辑时无副作用。 */
function finishEditing(apply: boolean) {
  if (!editing.value) return;
  try {
    const geometry = session.value?.stopEditing();
    if (apply && geometry && draft.value) {
      const next = copyGeometry(draft.value.geometry);
      if (activeEditRing && next.kind === "multipolygon") {
        if (geometry.kind !== "polygon") throw new Error("轮廓类型无效");
        next.polygons[activeEditRing.part][activeEditRing.ring] = geometry.points;
        draft.value = { ...draft.value, geometry: next, modified: true };
      } else draft.value = { ...draft.value, geometry: copyGeometry(geometry), modified: true };
    }
    session.value?.showGeometry(draft.value?.geometry ?? null);
  } catch {
    error.value = "编辑结果无效，已保留原草稿。";
    session.value?.showGeometry(draft.value?.geometry ?? null);
  } finally {
    editing.value = false;
    activeEditRing = undefined;
  }
}

/** 切换官方工具模式，取消只移除未完成的绘制，保留旧草稿。 */
function toggleDrawing() {
  cancelBoundary();
  error.value = "";
  keyError.value = false;
  if (drawing.value) {
    session.value?.stopDrawing();
    picking.value = !draft.value;
  } else {
    picking.value = false;
    mobileMap.value = true;
    session.value?.startDrawing(shape.value);
  }
  drawing.value = !drawing.value;
}
/** 清空当前草稿并取消待完成操作，不删除调用方已经保存的数据。 */
function clearRegion() {
  finishEditing(false);
  cancelBoundary();
  session.value?.stopDrawing();
  drawing.value = false;
  draft.value = undefined;
  regionConfig.value = true;
  picking.value = true;
  session.value?.showGeometry(null);
}
/** 明确进入选点模式；保留原区域直到实际点选，允许平移查看时不误改公司位置。 */
function beginPointSelection() {
  picking.value = true;
}
/** 发出包含原生形态和来源的副本；后端校验及保存由业务处理。 */
function confirmRegion() {
  const value = draft.value;
  if (!value || drawing.value || generating.value) return;
  session.value?.stopDrawing();
  emit("region", {
    provider: props.provider,
    coordinateSystem: "GCJ-02",
    ...value,
    geometry: copyGeometry(value.geometry),
    place: value.place ? { ...value.place, point: { ...value.place.point } } : undefined,
    boundary: value.boundary
      ? { ...value.boundary, geometry: copyGeometry(value.boundary.geometry) }
      : undefined,
  });
}

// DOM 挂载、厂商或配置变化时启动新周期，避免迟到搜索结果覆盖新的地图。
watch(
  [container, () => props.provider, () => props.credentials],
  () => {
    const initial =
      props.initialLocation?.provider === props.provider ? cloneModel(props.initialLocation) : null;
    selectedPlace.value = initial?.place;
    showResults.value = !initial?.place;
    draft.value = initial?.region;
    regionConfig.value = !initial?.region;
    picking.value = !initial?.region;
    drawing.value = false;
    void restart();
  },
  { flush: "post", deep: true }
);
/** 完成或回显区域后退出取点模式，二者使用独立交互意图。 */
watch(
  draft,
  (value) => {
    if (value) picking.value = false;
  },
  { flush: "sync" }
);
/** 草稿只通过事件传出，调用方确认前不会改变主表单。 */
watch(
  [selectedPlace, draft],
  () => {
    emit(
      "selection",
      selectedPlace.value
        ? cloneModel({
            provider: props.provider,
            coordinateSystem: "GCJ-02" as const,
            place: selectedPlace.value,
            region: draft.value
              ? { ...draft.value, provider: props.provider, coordinateSystem: "GCJ-02" as const }
              : undefined,
          })
        : null
    );
  },
  { flush: "post" }
);
watch(
  [ready, searching, drawing, editing, generating],
  () => {
    emit(
      "busy",
      !ready.value || searching.value || drawing.value || editing.value || generating.value
    );
  },
  { immediate: true, flush: "sync" }
);
onBeforeUnmount(() => {
  cancelBoundary();
  controller.abort();
  session.value?.destroy();
});
</script>

<style lang="scss">
.map-viewer {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  height: 700px;
  min-height: 0;
  min-width: 0;
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  overflow: hidden;
  background: var(--el-bg-color);
  &--embedded {
    height: 100%;
  }
  &__sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--el-border-color-light);
  }
  &__panel-heading {
    padding: 22px 20px 18px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    h3 {
      margin: 0;
      font-size: 19px;
      letter-spacing: -0.4px;
    }
    p {
      margin: 8px 0 18px;
      font-size: 13px;
      line-height: 1.7;
      color: var(--el-text-color-secondary);
    }
  }
  &__panel-scroll {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  &__panel-content {
    padding: 16px;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  &__dimensions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    label {
      display: grid;
      gap: 8px;
      font-size: 13px;
    }
  }
  &__dimension-input {
    width: 100%;
  }
  &__search {
    display: grid;
    gap: 10px;
  }
  &__label {
    font-size: 13px;
    font-weight: 500;
    color: var(--el-text-color-regular);
  }
  &__eyebrow {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  &__selected,
  &__region-summary {
    display: grid;
    gap: 10px;
    padding: 16px;
    border-radius: 10px;
    background: var(--el-color-primary-light-9);
    border: 1px solid var(--el-color-primary-light-8);
    overflow-wrap: anywhere;
    line-height: 1.6;
    > span {
      font-size: 12px;
    }
  }
  &__results {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: auto;
    min-height: 70px;
    flex: 1;
  }
  &__result {
    margin: 0 !important;
    height: auto;
    min-height: 64px;
    flex-shrink: 0;
    width: 100%;
    justify-content: flex-start;
    padding: 12px;
    white-space: normal;
    text-align: left;
  }
  &__result-content {
    display: grid;
    gap: 5px;
    line-height: 1.5;
    overflow-wrap: anywhere;
    span {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }
  &__result--selected {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
  &__section-title {
    strong {
      font-size: 15px;
    }
    p {
      margin: 8px 0 0;
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }
  }
  &__methods {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  &__hint,
  &__empty-hint {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    line-height: 1.8;
  }
  &__tools {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  &__stage {
    min-width: 0;
    min-height: 0;
    position: relative;
    background: var(--el-fill-color-light);
  }
  &__map-hint {
    position: absolute;
    z-index: 1;
    top: 16px;
    left: 16px;
    right: 16px;
    margin: auto;
    width: fit-content;
    max-width: calc(100% - 32px);
    padding: 10px 16px;
    border-radius: 8px;
    background: var(--el-bg-color);
    box-shadow: var(--el-box-shadow-light);
    color: var(--el-text-color-regular);
    font-size: 13px;
    pointer-events: none;
  }
  &__canvas {
    height: 100%;
    min-height: 0;
  }
  &__frame {
    display: block;
    border: 0;
    width: 100%;
    height: 100%;
  }
  &__panel-content > * {
    flex-shrink: 0;
  }
  &__panel-content > .map-viewer__results {
    flex-shrink: 1;
  }
  &__mobile-switch,
  &__mobile-edit {
    display: none;
  }
  @media (max-height: 850px) {
    &__panel-heading {
      padding: 12px 16px;
      h3,
      p {
        display: none;
      }
    }
    &__hint {
      font-size: 12px;
      line-height: 1.5;
    }
    &__panel-content {
      gap: 10px;
    }
  }
  @media (max-width: 760px) {
    position: relative;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    &__stage {
      display: block;
      position: absolute;
      inset: 0;
      visibility: hidden;
      pointer-events: none;
    }
    &__sidebar {
      border-right: 0;
      padding-bottom: 48px;
    }
    &--mobile-map &__sidebar {
      display: none;
    }
    &--mobile-map &__stage {
      visibility: visible;
      pointer-events: auto;
    }
    &__mobile-switch {
      display: block;
      position: absolute;
      z-index: 2;
      bottom: 10px;
      right: 10px;
    }
    &__mobile-edit {
      display: flex;
      position: absolute;
      top: 70px;
      left: 12px;
      gap: 8px;
    }
    &__panel-heading {
      padding: 12px 16px;
      h3,
      p {
        display: none;
      }
    }
    &__panel-content {
      padding: 12px;
      gap: 8px;
    }
  }
}
</style>

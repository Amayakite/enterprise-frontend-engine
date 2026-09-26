<template>
  <MyDialog
    v-model="visible"
    title="列设置"
    width="1100px"
    max-height="calc(100dvh - 48px)"
    :show-confirm="false"
    :show-cancel="false"
  >
    <div class="column-settings">
      <section class="column-settings__preview" aria-label="表头布局预览">
        <div class="column-settings__preview-title">
          <div>
            <strong>表头预览</strong>
            <span>点击定位设置；拖动普通列或整个分组可快速排序</span>
          </div>
          <span>{{ visibleCount }} / {{ totalCount }} 列已显示</span>
        </div>

        <div class="column-settings__preview-viewport">
          <div class="column-settings__preview-rail" :class="{ 'has-groups': hasGroupedPreview }">
            <div
              v-for="zone in groupDefinitions"
              :key="zone.fixed"
              class="column-settings__preview-zone"
              :class="`is-${zone.className}`"
            >
              <div
                v-if="zone.fixed === 'left' && hasSelection"
                class="column-settings__preview-cell is-system"
                :class="{ 'is-tall': hasGroupedPreview }"
                title="选择列"
              >
                <Lock />
                选择
              </div>

              <VueDraggable
                v-model="zoneUnits[zone.fixed]"
                class="column-settings__preview-sortable"
                :class="{
                  'is-disabled': !dragEnabled,
                  'is-drop-ready': dragging && zoneUnits[zone.fixed].length === 0,
                }"
                :animation="160"
                :disabled="!dragEnabled"
                :group="{ name: 'crud-preview-units' }"
                handle=".column-settings__preview-draggable"
                ghost-class="column-settings__preview-unit--ghost"
                chosen-class="column-settings__preview-unit--chosen"
                @start="dragging = true"
                @end="finishDrag"
              >
                <div
                  v-for="unit in zoneUnits[zone.fixed]"
                  v-show="previewUnitColumns(unit).length"
                  :key="unit.key"
                  class="column-settings__preview-unit column-settings__preview-draggable"
                  :style="unit.group ? previewBandWidth(previewUnitColumns(unit)) : undefined"
                >
                  <div
                    v-if="unit.group"
                    class="column-settings__preview-band"
                    :class="{
                      'is-selected':
                        selectedGroupKey === unit.group.key ||
                        previewUnitColumns(unit).some(isSelectedColumn),
                    }"
                  >
                    <div
                      class="column-settings__preview-group"
                      :style="previewGroupStyle(unit.group)"
                      :title="`点击设置${unit.group.label}；拖动整个分组排序`"
                      role="button"
                      tabindex="0"
                      @click.stop="selectHeaderGroup(unit.group.key)"
                      @keydown.enter.stop="selectHeaderGroup(unit.group.key)"
                      @keydown.space.stop.prevent="selectHeaderGroup(unit.group.key)"
                    >
                      {{ unit.group.label }}
                    </div>
                    <div class="column-settings__preview-leaves">
                      <div
                        v-for="column in previewUnitColumns(unit)"
                        :key="column.key"
                        class="column-settings__preview-cell"
                        :class="{ 'is-selected': isSelectedColumn(column) }"
                        :style="previewCellStyle(column)"
                        :title="`点击设置${column.label}；拖动整个分组排序`"
                        role="button"
                        tabindex="0"
                        @click.stop="selectItem(column.key)"
                        @keydown.enter.stop="selectItem(column.key)"
                        @keydown.space.stop.prevent="selectItem(column.key)"
                      >
                        {{ column.label }}
                      </div>
                    </div>
                  </div>
                  <div
                    v-else-if="previewUnitColumns(unit).length"
                    class="column-settings__preview-cell"
                    :class="{
                      'is-selected': isSelectedColumn(previewUnitColumns(unit)[0]!),
                      'is-tall': hasGroupedPreview,
                    }"
                    :style="previewCellStyle(previewUnitColumns(unit)[0]!)"
                    :title="`点击设置${previewUnitColumns(unit)[0]!.label}；拖动排序`"
                    role="button"
                    tabindex="0"
                    @click="selectItem(previewUnitColumns(unit)[0]!.key)"
                    @keydown.enter="selectItem(previewUnitColumns(unit)[0]!.key)"
                    @keydown.space.prevent="selectItem(previewUnitColumns(unit)[0]!.key)"
                  >
                    {{ previewUnitColumns(unit)[0]!.label }}
                  </div>
                </div>
              </VueDraggable>

              <div
                v-if="zone.fixed === 'right' && hasActions"
                class="column-settings__preview-cell is-system"
                :class="{ 'is-tall': hasGroupedPreview }"
                title="操作列"
              >
                操作
                <Lock />
              </div>
            </div>
          </div>
        </div>
        <div class="column-settings__preview-legend" aria-hidden="true">
          <span>左侧固定</span>
          <span>跟随表格滚动</span>
          <span>右侧固定</span>
        </div>
      </section>

      <div class="column-settings__toolbar">
        <el-input
          v-model="keyword"
          class="column-settings__search"
          clearable
          :prefix-icon="Search"
          placeholder="搜索栏目或分组"
          aria-label="搜索栏目或分组"
        />
        <el-radio-group v-model="filter" size="small" aria-label="栏目显示状态">
          <el-radio-button value="all">全部 {{ totalCount }}</el-radio-button>
          <el-radio-button value="visible">已显示 {{ visibleCount }}</el-radio-button>
          <el-radio-button value="hidden">已隐藏 {{ hiddenCount }}</el-radio-button>
        </el-radio-group>
        <span v-if="!dragEnabled" class="column-settings__filter-hint">清除筛选后可调整顺序</span>
      </div>

      <el-splitter
        class="column-settings__workspace"
        :layout="isNarrow ? 'vertical' : 'horizontal'"
        lazy
      >
        <el-splitter-panel
          v-model:size="structurePaneSize"
          :min="isNarrow ? 220 : 380"
          :max="isNarrow ? '65%' : '70%'"
          collapsible
        >
          <section class="column-settings__list-pane" aria-label="栏目结构与顺序">
            <div class="column-settings__list-head" aria-hidden="true">
              <span>栏目结构与顺序</span>
              <span>对齐</span>
              <span>宽度</span>
            </div>
            <div class="column-settings__groups">
              <!-- 固定分区始终挂载，保证跨区拖动时目标稳定存在。 -->
              <section
                v-for="zone in groupDefinitions"
                :key="zone.fixed"
                class="column-settings__zone"
              >
                <header class="column-settings__zone-header">
                  <span class="column-settings__zone-direction">{{ zone.symbol }}</span>
                  <span>{{ zone.label }}</span>
                  <small>{{ filteredItemCount(zone.fixed) }}</small>
                </header>
                <VueDraggable
                  v-model="zoneUnits[zone.fixed]"
                  class="column-settings__list"
                  :class="{ 'is-drop-ready': dragging && zoneUnits[zone.fixed].length === 0 }"
                  :animation="160"
                  :disabled="!dragEnabled"
                  :group="{ name: 'crud-column-units' }"
                  handle=".column-settings__unit-drag"
                  ghost-class="column-settings__row--ghost"
                  chosen-class="column-settings__row--chosen"
                  @start="dragging = true"
                  @end="finishDrag"
                >
                  <div
                    v-for="unit in zoneUnits[zone.fixed]"
                    v-show="unitMatchesFilter(unit)"
                    :key="unit.key"
                    class="column-settings__item"
                  >
                    <template v-if="unit.group">
                      <header
                        class="column-settings__header-group"
                        :class="{ 'is-selected': selectedGroupKey === unit.group.key }"
                        role="button"
                        tabindex="0"
                        @click="selectHeaderGroup(unit.group.key)"
                        @keydown.enter.self="selectHeaderGroup(unit.group.key)"
                        @keydown.space.self.prevent="selectHeaderGroup(unit.group.key)"
                      >
                        <span
                          class="column-settings__drag column-settings__unit-drag"
                          :class="{ 'is-disabled': !dragEnabled }"
                          :title="
                            dragEnabled
                              ? `拖动整个${unit.group.label}分组调整顺序或固定位置`
                              : '清除筛选后可拖动'
                          "
                        >
                          <Rank aria-hidden="true" />
                        </span>
                        <el-checkbox
                          :model-value="headerGroupAllVisible(unit.group.key)"
                          :indeterminate="headerGroupIndeterminate(unit.group.key)"
                          :disabled="headerGroupHideDisabled(unit.group.key)"
                          :aria-label="`显示或隐藏分组${unit.group.label}`"
                          @change="setHeaderGroupVisibility(unit.group.key, $event)"
                        />
                        <span class="column-settings__header-group-name">
                          {{ unit.group.label }}
                        </span>
                        <small>
                          {{ headerGroupVisibleCount(unit.group.key) }} / {{ unit.items.length }}
                        </small>
                        <span class="column-settings__group-lock">不可拆分</span>
                        <el-button
                          class="column-settings__restore-group"
                          link
                          @click="restoreHeaderGroup(unit.group.key)"
                        >
                          恢复本组
                        </el-button>
                      </header>
                      <div class="column-settings__group-items">
                        <div
                          v-for="item in unit.items"
                          v-show="matchesFilter(item)"
                          :key="item.key"
                          role="button"
                          tabindex="0"
                          class="column-settings__row is-grouped"
                          :class="{
                            'is-selected': selectedKey === item.key,
                            'is-hidden': !item.visible,
                          }"
                          @click="selectItem(item.key)"
                          @keydown.enter.self="selectItem(item.key)"
                          @keydown.space.self.prevent="selectItem(item.key)"
                        >
                          <el-checkbox
                            :model-value="item.visible"
                            :disabled="item.visible && visibleCount === 1"
                            :aria-label="`${item.visible ? '隐藏' : '显示'}${labelOf(item.key)}`"
                            @click.stop="selectItem(item.key)"
                            @change="setItemVisibility(item, $event === true)"
                          />
                          <span class="column-settings__row-name" :title="labelOf(item.key)">
                            {{ labelOf(item.key) }}
                          </span>
                          <span class="column-settings__row-align">
                            <span class="column-settings__align-glyph" :class="`is-${item.align}`">
                              <i />
                              <i />
                              <i />
                            </span>
                            {{ alignLabel(item.align) }}
                          </span>
                          <span class="column-settings__row-width">{{ item.width ?? 160 }} px</span>
                          <ArrowRight class="column-settings__row-chevron" aria-hidden="true" />
                        </div>
                      </div>
                    </template>
                    <div
                      v-else
                      role="button"
                      tabindex="0"
                      class="column-settings__row"
                      :class="{
                        'is-selected': selectedKey === unit.items[0]!.key,
                        'is-hidden': !unit.items[0]!.visible,
                      }"
                      @click="selectItem(unit.items[0]!.key)"
                      @keydown.enter.self="selectItem(unit.items[0]!.key)"
                      @keydown.space.self.prevent="selectItem(unit.items[0]!.key)"
                    >
                      <span
                        class="column-settings__drag column-settings__unit-drag"
                        :class="{ 'is-disabled': !dragEnabled }"
                        :title="dragEnabled ? '拖动调整顺序或固定位置' : '清除筛选后可拖动'"
                      >
                        <Rank aria-hidden="true" />
                      </span>
                      <el-checkbox
                        :model-value="unit.items[0]!.visible"
                        :disabled="unit.items[0]!.visible && visibleCount === 1"
                        :aria-label="`${
                          unit.items[0]!.visible ? '隐藏' : '显示'
                        }${labelOf(unit.items[0]!.key)}`"
                        @click.stop="selectItem(unit.items[0]!.key)"
                        @change="setItemVisibility(unit.items[0]!, $event === true)"
                      />
                      <span class="column-settings__row-name" :title="labelOf(unit.items[0]!.key)">
                        {{ labelOf(unit.items[0]!.key) }}
                      </span>
                      <span class="column-settings__row-align">
                        <span
                          class="column-settings__align-glyph"
                          :class="`is-${unit.items[0]!.align}`"
                        >
                          <i />
                          <i />
                          <i />
                        </span>
                        {{ alignLabel(unit.items[0]!.align) }}
                      </span>
                      <span class="column-settings__row-width">
                        {{ unit.items[0]!.width ?? 160 }} px
                      </span>
                      <ArrowRight class="column-settings__row-chevron" aria-hidden="true" />
                    </div>
                  </div>
                </VueDraggable>
                <div
                  v-if="dragging && zoneUnits[zone.fixed].length === 0"
                  class="column-settings__drop-message"
                >
                  将栏目或整个分组拖到这里
                </div>
              </section>
              <el-empty v-if="filteredTotal === 0" :image-size="64" description="没有匹配的栏目" />
            </div>
          </section>
        </el-splitter-panel>

        <el-splitter-panel :min="isNarrow ? 260 : 300">
          <aside
            v-if="selectedGroup || selected"
            class="column-settings__inspector"
            aria-label="当前表头或栏目设置"
          >
            <template v-if="selectedGroup?.group">
              <div class="column-settings__inspector-title">
                <span>当前分组表头</span>
                <strong>{{ selectedGroup.group.label }}</strong>
                <small>{{ selectedGroup.items.length }} 个栏目 · 作为整体排序和固定</small>
              </div>
              <div class="column-settings__setting-row">
                <div>
                  <label for="group-visible">显示整组</label>
                  <small>仍可在左侧分别调整子栏目显隐</small>
                </div>
                <el-switch
                  id="group-visible"
                  :model-value="headerGroupAllVisible(selectedGroup.group.key)"
                  :disabled="headerGroupHideDisabled(selectedGroup.group.key)"
                  inline-prompt
                  active-text="开"
                  inactive-text="关"
                  @change="setHeaderGroupVisibility(selectedGroup.group.key, $event)"
                />
              </div>
              <div class="column-settings__setting-block">
                <label>分组标题对齐</label>
                <el-radio-group
                  :model-value="selectedGroupAlign"
                  @update:model-value="setSelectedGroupAlign"
                  aria-label="分组标题对齐"
                >
                  <el-radio-button
                    v-for="option in alignOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </el-radio-button>
                </el-radio-group>
                <small>只影响上层分组标题，子栏目标题和内容保持各自设置。</small>
              </div>
              <div class="column-settings__setting-block">
                <label>整组固定位置</label>
                <el-radio-group
                  :model-value="selectedGroupFixed"
                  class="column-settings__fixed-control"
                  aria-label="整组固定位置"
                  @update:model-value="setSelectedGroupFixed"
                >
                  <el-radio-button value="left">左侧</el-radio-button>
                  <el-radio-button value="none">滚动</el-radio-button>
                  <el-radio-button value="right">右侧</el-radio-button>
                </el-radio-group>
                <small>分组内栏目不能移出；切换固定位置会移动整个表头。</small>
              </div>
              <el-button class="column-settings__reset-column" @click="restoreSelectedGroup">
                恢复本组默认设置
              </el-button>
            </template>
            <template v-else-if="selected">
              <div class="column-settings__inspector-title">
                <span>当前栏目</span>
                <strong>{{ labelOf(selected.key) }}</strong>
                <small v-if="selectedHeaderGroup">
                  {{ selectedHeaderGroup.label }} / {{ labelOf(selected.key) }}
                </small>
              </div>
              <div class="column-settings__setting-row">
                <div>
                  <label for="column-visible">显示栏目</label>
                  <small>隐藏后仍保留配置顺序</small>
                </div>
                <el-switch
                  id="column-visible"
                  v-model="selected.visible"
                  :disabled="selected.visible && visibleCount === 1"
                  inline-prompt
                  active-text="开"
                  inactive-text="关"
                />
              </div>
              <div class="column-settings__setting-block">
                <label>内容对齐</label>
                <el-radio-group v-model="selected.align" aria-label="内容对齐">
                  <el-radio-button
                    v-for="option in alignOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </el-radio-button>
                </el-radio-group>
                <small>列标题和单元格使用同一对齐方式；上层分组标题单独设置。</small>
              </div>
              <div v-if="!selectedHeaderGroup" class="column-settings__setting-block">
                <label>固定位置</label>
                <el-radio-group
                  :model-value="selected.fixed"
                  class="column-settings__fixed-control"
                  aria-label="固定位置"
                  @update:model-value="setSelectedFixed"
                >
                  <el-radio-button value="left">左侧</el-radio-button>
                  <el-radio-button value="none">滚动</el-radio-button>
                  <el-radio-button value="right">右侧</el-radio-button>
                </el-radio-group>
                <small>固定栏目始终显示在表格边缘。</small>
              </div>
              <div class="column-settings__setting-block">
                <div class="column-settings__width-label">
                  <label for="column-width">栏目宽度</label>
                  <el-input-number
                    id="column-width"
                    class="column-settings__width-input"
                    v-model="selectedWidth"
                    :min="64"
                    :max="1000"
                    :step="10"
                    step-strictly
                    controls-position="right"
                    aria-label="栏目宽度"
                  />
                </div>
                <el-slider v-model="selectedWidth" :min="64" :max="1000" :step="10" />
                <div class="column-settings__width-range" aria-hidden="true">
                  <span>64 px</span>
                  <span>1000 px</span>
                </div>
              </div>
              <el-button class="column-settings__reset-column" @click="restoreSelected">
                恢复此栏默认设置
              </el-button>
            </template>
          </aside>
          <div v-else class="column-settings__inspector-empty">从预览或列表中选择一个栏目</div>
        </el-splitter-panel>
      </el-splitter>
    </div>

    <template #footer>
      <div class="column-settings__footer">
        <span class="column-settings__density">界面密度在右上角“外观设置”中统一调整</span>
        <div class="column-settings__footer-actions">
          <el-button v-if="hiddenCount" link type="primary" @click="showAll">全部显示</el-button>
          <el-button link type="primary" @click="restoreDraft">恢复全部默认</el-button>
          <el-button @click="visible = false">取消</el-button>
          <ActionButton label="保存设置" tone="primary" :link="false" @click="confirm" />
        </div>
      </div>
    </template>
  </MyDialog>
</template>

<script setup lang="ts" generic="Row extends object">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { ArrowRight, Lock, Rank, Search } from "@element-plus/icons-vue";
import { VueDraggable } from "vue-draggable-plus";
import ActionButton from "@/components/business/ActionButton.vue";
import MyDialog from "@/components/common/MyDialog.vue";
import type { CSSProperties } from "vue";
import type { TableColumn, TableHeaderGroup, TableViewColumn } from "@/components/table/types";
import type {
  CrudColumnAlign,
  CrudColumnDensity,
  CrudColumnFixed,
  CrudColumnPreference,
} from "@/components/table/column-preferences";

import {
  groupColumnPreferences,
  applyColumnPreference,
} from "@/components/table/column-preferences";

type VisibilityFilter = "all" | "visible" | "hidden";
interface ColumnUnit {
  key: string;
  group?: TableHeaderGroup;
  items: CrudColumnPreference[];
}

const props = withDefaults(
  defineProps<{
    /**
     * 弹窗开关状态（v-model）。
     * @example `<CrudColumnSettingsDialog v-model="columnSettingsOpen" ... />`
     */
    modelValue: boolean;
    /**
     * 模块默认列定义。
     * @example `<CrudColumnSettingsDialog :columns="config.columns" ... />`
     */
    columns: readonly TableColumn<Row>[];
    /**
     * 当前用户列偏好。
     * @example `<CrudColumnSettingsDialog :items="preferences.items.value" ... />`
     */
    items: readonly CrudColumnPreference[];
    /**
     * 恢复默认时采用的列偏好。
     * @example `<CrudColumnSettingsDialog :defaults="preferences.defaults()" ... />`
     */
    defaults: readonly CrudColumnPreference[];
    /**
     * 当前表格密度。
     * @example `<CrudColumnSettingsDialog density="compact" ... />`
     */
    density: CrudColumnDensity;
    /**
     * 列表是否启用选择列，默认 false。
     * @example `<CrudColumnSettingsDialog :has-selection="true" ... />`
     */
    hasSelection?: boolean;
    /**
     * 列表是否存在操作列，默认 false。
     * @example `<CrudColumnSettingsDialog :has-actions="true" ... />`
     */
    hasActions?: boolean;
  }>(),
  { hasSelection: false, hasActions: false }
);
const emit = defineEmits<{
  /**
   * 列设置弹窗开关状态（v-model）。
   * @example `<CrudColumnSettingsDialog v-model="columnSettingsOpen" />`
   */
  "update:modelValue": [value: boolean];
  /**
   * 用户确认列设置，返回完整列偏好和表格密度；调用方负责持久化。
   * @example `<CrudColumnSettingsDialog @apply="(items, density) => preferences.apply(items, density)" />`
   */
  apply: [items: CrudColumnPreference[], density: CrudColumnDensity];
}>();

/** 列设置的左固定、随表滚动、右固定三个区域及标题样式，拖动和预览共用。 */
const groupDefinitions: readonly {
  fixed: CrudColumnFixed;
  label: string;
  symbol: string;
  className: string;
}[] = [
  { fixed: "left", label: "固定在左侧", symbol: "←", className: "left" },
  { fixed: "none", label: "跟随表格滚动", symbol: "↔", className: "center" },
  { fixed: "right", label: "固定在右侧", symbol: "→", className: "right" },
];
/** 对齐方式代码及中文名称，列和表头组设置共用。 */
const alignOptions: readonly { value: CrudColumnAlign; label: string }[] = [
  { value: "left", label: "左对齐" },
  { value: "center", label: "居中" },
  { value: "right", label: "右对齐" },
];
/** 三块区域中的临时列顺序；有分组的列作为一个整体移动，点击应用前不修改真实表格。 */
const zoneUnits = reactive<Record<CrudColumnFixed, ColumnUnit[]>>({
  left: [],
  none: [],
  right: [],
});
/** 本次窗口里选择的表格密度，应用时才通知外层保存。 */
const draftDensity = ref<CrudColumnDensity>("compact");
/** 按列名或表头组名搜索的输入，不影响实际表格查询。 */
const keyword = ref("");
/** 当前只查看全部、已显示还是已隐藏列，便于批量检查列设置。 */
const filter = ref<VisibilityFilter>("all");
/** 右侧属性面板当前编辑的单列 key，与选中表头组互斥。 */
const selectedKey = ref("");
/** 右侧属性面板当前编辑的表头组 key，与选中单列互斥。 */
const selectedGroupKey = ref("");
/** 是否正在拖列，用于拖动过程中的交互和样式反馈。 */
const dragging = ref(false);
/** 结构列表与属性预览之间的分栏尺寸，默认分给左侧 52%。 */
const structurePaneSize = ref<string | number>("52%");
/** 窄窗口下调整设置面板布局，避免两栏内容挤在一起。 */
const isNarrow = useMediaQuery("(max-width: 900px)");

/** 将窗口开关与父页面 v-model 对接，关闭只发通知，不直接修改 prop。 */
const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});
/** 按列 key 索引原始配置，用来读取名称和分组，避免反复遍历。 */
const columnsByKey = computed(
  () => new Map(props.columns.map((column) => [column.key as string, column]))
);
/** 按左、中、右顺序合并所有列组，用于统一搜索和预览。 */
const allUnits = computed(() => [zoneUnits.left, zoneUnits.none, zoneUnits.right].flat());
/** 展开所有组得到临时列设置列表，统计数量和应用配置时使用。 */
const allItems = computed(() => allUnits.value.flatMap((unit) => unit.items));
/** 目前设置为显示的列数，禁止隐藏最后一列时使用。 */
const visibleCount = computed(() => allItems.value.filter((item) => item.visible).length);
/** 目前隐藏的列数，用于筛选入口的数量提示。 */
const hiddenCount = computed(() => allItems.value.length - visibleCount.value);
/** 全部业务列数量，不受当前搜索和显隐筛选影响。 */
const totalCount = computed(() => allItems.value.length);
/** 当前搜索和显隐条件命中的列数，用于空结果和计数显示。 */
const filteredTotal = computed(() => allItems.value.filter(matchesFilter).length);
/** 只有展示完整列列表时允许拖动，避免过滤后的顺序被误当作实际列顺序。 */
const dragEnabled = computed(() => filter.value === "all" && !keyword.value.trim());
/** 当前选中列的临时设置，属性面板直接修改这份草稿。 */
const selected = computed(() => allItems.value.find((item) => item.key === selectedKey.value));
/** 当前选中的表头组及成员列，用于整组移动或调整对齐。 */
const selectedGroup = computed(() =>
  allUnits.value.find((unit) => unit.group?.key === selectedGroupKey.value)
);
/** 当前单列所属的表头组；组内列不能脱离该组单独固定。 */
const selectedHeaderGroup = computed(() =>
  selected.value ? headerGroupOf(selected.value) : undefined
);
/** 读取组标题的对齐设置，未指定时默认居中。 */
const selectedGroupAlign = computed(
  () => selectedGroup.value?.items[0]?.groupAlign ?? selectedGroup.value?.group?.align ?? "center"
);
/** 从组内列读取统一固定位置，空组默认跟随表格滚动。 */
const selectedGroupFixed = computed(
  () => selectedGroup.value?.items[0]?.fixed ?? ("none" as CrudColumnFixed)
);
/** 连接列宽输入与选中列草稿，未取到列宽时显示 160。 */
const selectedWidth = computed({
  get: () => selected.value?.width ?? 160,
  set: (value: number) => {
    if (selected.value) selected.value.width = value;
  },
});

/** 存在可见分组列时使用分组表头预览，纯普通列不多画一层标题。 */
const hasGroupedPreview = computed(() =>
  allUnits.value.some((unit) => !!unit.group && unit.items.some((item) => item.visible))
);
/** 每次打开窗口都从已应用列设置创建新草稿，取消后的修改不会带到下次。 */
watch(
  () => props.modelValue,
  (open) => {
    if (open) loadDraft(props.items, props.density);
  },
  { immediate: true }
);

/** 逐项复制列偏好，避免设置窗口直接修改父页面已应用对象。 */
function cloneItems(items: readonly CrudColumnPreference[]) {
  return items.map((item) => ({ ...item }));
}
/** 把列偏好按表头组和固定位置整理为可拖动草稿，并重置搜索、选择和拖动状态。 */
function loadDraft(items: readonly CrudColumnPreference[], density: CrudColumnDensity) {
  const units: ColumnUnit[] = groupColumnPreferences(props.columns, items).map((unit) => ({
    ...unit,
    key: unitKey(unit.items[0]!),
  }));
  for (const zone of groupDefinitions)
    zoneUnits[zone.fixed] = units.filter((unit) => unit.items[0]?.fixed === zone.fixed);
  draftDensity.value = density;
  keyword.value = "";
  filter.value = "all";
  const initial = units[0];
  if (initial?.group) selectHeaderGroup(initial.group.key);
  else selectItem(initial?.items[0]?.key ?? "");
  dragging.value = false;
}
/** 按 key 取得原始业务列，获取名称和分组等不由用户改写的配置。 */
function columnOf(key: string) {
  return columnsByKey.value.get(key);
}
/** 取得列的显示名称，未知列以 key 兜底，便于识别失效配置。 */
function labelOf(key: string) {
  return columnOf(key)?.label ?? key;
}
/** 读取列所属表头组，没有分组时作为独立列处理。 */
function headerGroupOf(item: CrudColumnPreference) {
  return columnOf(item.key)?.headerGroup;
}
/** 为独立列或整组生成不同前缀的拖动 ID，避免同名 key 冲突。 */
function unitKey(item: CrudColumnPreference) {
  const headerGroup = headerGroupOf(item);
  return headerGroup ? `group:${headerGroup.key}` : `column:${item.key}`;
}
/** 选中单列并退出组选择，右侧显示该列的属性。 */
function selectItem(key: string) {
  selectedKey.value = key;
  selectedGroupKey.value = "";
}
/** 选中整组并清除单列选择，右侧显示组属性。 */
function selectHeaderGroup(key: string) {
  selectedGroupKey.value = key;
  selectedKey.value = "";
}
/** 同时匹配关键词和显隐筛选，关键词可命中列名或组名。 */
function matchesFilter(item: CrudColumnPreference) {
  const query = keyword.value.trim().toLocaleLowerCase();
  const groupLabel = headerGroupOf(item)?.label ?? "";
  return (
    `${groupLabel} ${labelOf(item.key)}`.toLocaleLowerCase().includes(query) &&
    (filter.value === "all" ||
      (filter.value === "visible" && item.visible) ||
      (filter.value === "hidden" && !item.visible))
  );
}
/** 组内至少一列命中条件时保留该组，避免搜索时把匹配列一起隐藏。 */
function unitMatchesFilter(unit: ColumnUnit) {
  return unit.items.some(matchesFilter);
}
/** 统计指定固定区域内命中筛选的列数。 */
function filteredItemCount(fixed: CrudColumnFixed) {
  return zoneUnits[fixed].flatMap((unit) => unit.items).filter(matchesFilter).length;
}
/** 切换一列显隐，但阻止隐藏整个表格剩下的最后一列。 */
function setItemVisibility(item: CrudColumnPreference, value: boolean) {
  if (!value && item.visible && visibleCount.value === 1) return;
  item.visible = value;
}
/** 查找某列所在的拖动单元，组内列共享同一个单元。 */
function unitOf(item: CrudColumnPreference) {
  return allUnits.value.find((unit) => unit.items.some((entry) => entry.key === item.key));
}
/** 从原区域移出整列或整组，统一更新固定位置后插入目标区域。 */
function moveUnit(unit: ColumnUnit, target: CrudColumnFixed, index?: number) {
  for (const fixed of ["left", "none", "right"] as const) {
    const currentIndex = zoneUnits[fixed].findIndex((entry) => entry.key === unit.key);
    if (currentIndex >= 0) zoneUnits[fixed].splice(currentIndex, 1);
  }
  for (const item of unit.items) item.fixed = target;
  zoneUnits[target].splice(index ?? zoneUnits[target].length, 0, unit);
}
/** 修改独立列的固定位置；属于表头组的列必须通过整组操作移动。 */
function setSelectedFixed(value: string | number | boolean | undefined) {
  if (
    !selected.value ||
    selectedHeaderGroup.value ||
    !["left", "none", "right"].includes(String(value))
  )
    return;
  const unit = unitOf(selected.value);
  if (unit) moveUnit(unit, String(value) as CrudColumnFixed);
}
/** 把所选表头组全部移动到左固定、滚动或右固定区域。 */
function setSelectedGroupFixed(value: string | number | boolean | undefined) {
  if (!selectedGroup.value || !["left", "none", "right"].includes(String(value))) return;
  moveUnit(selectedGroup.value, String(value) as CrudColumnFixed);
}
/** 同时更新组内成员保存的组标题对齐设置，使恢复后仍一致。 */
function setSelectedGroupAlign(value: string | number | boolean | undefined) {
  if (value !== "left" && value !== "center" && value !== "right") return;
  if (!selectedGroup.value) return;
  for (const item of selectedGroup.value.items) item.groupAlign = value;
}
/** 等待拖动库更新数组后，按各区域重新写入固定位置并结束拖动态。 */
async function finishDrag() {
  await nextTick();
  for (const zone of groupDefinitions)
    for (const unit of zoneUnits[zone.fixed])
      for (const item of unit.items) item.fixed = zone.fixed;
  dragging.value = false;
}
/** 收集一个表头组的所有列，整组显隐和恢复默认共同使用。 */
function headerGroupItems(key: string) {
  return allItems.value.filter((item) => headerGroupOf(item)?.key === key);
}
/** 统计指定组中当前可见列数量。 */
function headerGroupVisibleCount(key: string) {
  return headerGroupItems(key).filter((item) => item.visible).length;
}
/** 判断组内列是否全部可见，控制组级勾选框。 */
function headerGroupAllVisible(key: string) {
  const items = headerGroupItems(key);
  return !!items.length && items.every((item) => item.visible);
}
/** 组内只有部分列可见时显示半选状态。 */
function headerGroupIndeterminate(key: string) {
  const visibleItems = headerGroupVisibleCount(key);
  return visibleItems > 0 && visibleItems < headerGroupItems(key).length;
}
/** 如果隐藏该组会让整个表格没有任何列，就禁止整组隐藏。 */
function headerGroupHideDisabled(key: string) {
  const visibleItems = headerGroupVisibleCount(key);
  return headerGroupAllVisible(key) && visibleItems > 0 && visibleCount.value === visibleItems;
}
/** 一次切换整组显隐，同时保留至少一个可见业务列。 */
function setHeaderGroupVisibility(key: string, value: string | number | boolean) {
  const show = value === true;
  if (!show && headerGroupHideDisabled(key)) return;
  for (const item of headerGroupItems(key)) item.visible = show;
}
/** 按默认列顺序计算恢复后的插入位置，只比较同一个固定区域。 */
function defaultUnitIndex(item: CrudColumnPreference) {
  const preceding = new Set<string>();
  for (const entry of props.defaults) {
    if (entry.fixed !== item.fixed) continue;
    if (entry.key === item.key) break;
    preceding.add(unitKey(entry));
  }
  return zoneUnits[item.fixed].filter((unit) => preceding.has(unit.key)).length;
}
/** 恢复单列默认显隐、宽度和对齐；组内列不单独移动整个表头组。 */
function restoreItem(item: CrudColumnPreference) {
  const original = props.defaults.find((entry) => entry.key === item.key);
  if (!original) return;
  const unit = unitOf(item);
  if (!unit) return;
  if (unit.group) {
    item.visible = original.visible;
    item.width = original.width;
    item.align = original.align;
    return;
  }
  Object.assign(item, original);
  moveUnit(unit, original.fixed, defaultUnitIndex(original));
}
/** 只恢复当前选中列，不改其他列的临时设置。 */
function restoreSelected() {
  if (selected.value) restoreItem(selected.value);
}
/** 恢复当前选中的整个表头组。 */
function restoreSelectedGroup() {
  if (selectedGroup.value?.group) restoreHeaderGroup(selectedGroup.value.group.key);
}
/** 恢复组内所有列的默认属性和顺序，并把整组移回默认固定位置。 */
function restoreHeaderGroup(key: string) {
  const orderedDefaults = props.defaults.filter((item) => {
    const column = columnOf(item.key);
    return column?.headerGroup?.key === key;
  });
  const unit = allUnits.value.find((entry) => entry.group?.key === key);
  const first = orderedDefaults[0];
  if (!unit || !first) return;
  for (const original of orderedDefaults) {
    const item = unit.items.find((entry) => entry.key === original.key);
    if (item) Object.assign(item, original);
  }
  const order = new Map(orderedDefaults.map((item, index) => [item.key, index]));
  unit.items.sort((left, right) => (order.get(left.key) ?? 0) - (order.get(right.key) ?? 0));
  moveUnit(unit, first.fixed, defaultUnitIndex(first));
}
/** 把临时偏好合并到原始列生成预览配置，隐藏列不进入预览。 */
function draftColumn(item: CrudColumnPreference): TableColumn<Row> | undefined {
  return applyColumnPreference(columnOf(item.key), item);
}
/** 按拖动单元预先生成可见预览列，结构和属性面板共用。 */
const previewColumns = computed(
  () =>
    new Map(
      allUnits.value.map((unit) => [
        unit.key,
        unit.items.flatMap((item) => draftColumn(item) ?? []),
      ])
    )
);
/** 读取当前列或组对应的预览列，未找到时显示空列表。 */
function previewUnitColumns(unit: ColumnUnit): TableViewColumn<Row>[] {
  return previewColumns.value.get(unit.key) ?? [];
}
/** 把真实列宽缩小到预览合适的范围，避免超宽列撑破设置窗口。 */
function previewSize(column: TableViewColumn<Row>) {
  return Math.max(68, Math.min(142, (column.width ?? column.minWidth ?? 160) * 0.52));
}
/** 将列宽和对齐方式转换为预览单元格样式。 */
function previewCellStyle(column: TableViewColumn<Row>): CSSProperties {
  const justifyContent =
    column.align === "right" ? "flex-end" : column.align === "center" ? "center" : "flex-start";
  return { flexBasis: `${previewSize(column)}px`, justifyContent };
}
/** 汇总组内预览列宽，让组标题与下面列对齐。 */
function previewBandWidth(columns: readonly TableViewColumn<Row>[]): CSSProperties {
  return { flexBasis: `${columns.reduce((total, column) => total + previewSize(column), 0)}px` };
}
/** 应用组标题对齐方式，未指定时居中。 */
function previewGroupStyle(group: TableHeaderGroup): CSSProperties {
  return { textAlign: group.align ?? "center" };
}
/** 在预览中高亮属性面板当前选中的列。 */
function isSelectedColumn(column: TableViewColumn<Row>) {
  return selectedKey.value === column.key;
}
/** 把对齐代码显示成中文，未知值以左对齐文案兜底。 */
function alignLabel(value: CrudColumnAlign) {
  return alignOptions.find((option) => option.value === value)?.label ?? "左对齐";
}
/** 在草稿中显示全部列，仍需点击应用才影响列表。 */
function showAll() {
  for (const item of allItems.value) item.visible = true;
}
/** 把整个设置草稿恢复为模块默认列配置和紧凑密度，尚不写入用户偏好。 */
function restoreDraft() {
  loadDraft(props.defaults, "compact");
}
/** 至少保留一列后发布列设置副本和密度，再关闭窗口；外层负责持久化。 */
function confirm() {
  if (!visibleCount.value) return;
  emit("apply", cloneItems(allItems.value), draftDensity.value);
  visible.value = false;
}
</script>

<style scoped lang="scss">
.column-settings {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
}
.column-settings__preview {
  padding: 16px;
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
}
.column-settings__preview-title {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  > div {
    display: grid;
    gap: 2px;
  }
  strong {
    color: var(--el-text-color-primary);
    font-size: 14px;
  }
}
.column-settings__preview-viewport {
  overflow-x: auto;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-small);
}
.column-settings__preview-rail {
  display: flex;
  min-width: 100%;
  width: max-content;
  min-height: 40px;
  &.has-groups {
    min-height: 68px;
  }
}
.column-settings__preview-zone {
  display: flex;
  min-width: 20px;
  &.is-left,
  &.is-right {
    background: color-mix(in srgb, var(--el-color-primary) 6%, var(--el-bg-color));
  }
  &.is-center {
    flex: 1 0 auto;
  }
  & + & {
    border-left: 1px solid var(--el-border-color);
  }
}
.column-settings__preview-sortable {
  display: flex;
  min-width: 18px;
  transition:
    background-color 0.15s,
    box-shadow 0.15s;
  &.is-disabled .column-settings__preview-draggable {
    cursor: default;
  }
  &.is-drop-ready {
    background: var(--el-color-primary-light-9);
    box-shadow: inset 0 0 0 1px var(--el-color-primary-light-5);
  }
}
.column-settings__preview-unit {
  min-width: 0;
  flex: 0 0 auto;
  cursor: grab;
}
.column-settings__preview-band {
  min-width: 0;
  width: 100%;
  border-right: 1px solid var(--el-border-color-lighter);
  &.is-selected .column-settings__preview-group {
    color: var(--el-color-primary);
  }
}
.column-settings__preview-unit--ghost {
  opacity: 0.28;
}
.column-settings__preview-unit--chosen {
  box-shadow: inset 0 0 0 2px var(--el-color-primary);
}
.column-settings__preview-group {
  height: 29px;
  padding: 6px 8px;
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: color-mix(in srgb, var(--el-color-primary) 7%, var(--el-bg-color));
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  &:focus-visible {
    position: relative;
    outline: 2px solid var(--el-color-primary);
    outline-offset: -2px;
  }
}
.column-settings__preview-leaves {
  display: flex;
}
.column-settings__preview-cell {
  display: flex;
  min-width: 68px;
  max-width: 142px;
  height: 39px;
  flex: 0 0 82px;
  gap: 4px;
  align-items: center;
  padding: 0 9px;
  overflow: hidden;
  color: var(--el-text-color-regular);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-right: 1px solid var(--el-border-color-lighter);
  transition:
    color 0.16s,
    background-color 0.16s,
    box-shadow 0.16s;
  &.is-tall {
    height: 68px;
  }
  &.is-system {
    justify-content: center;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
  }
  &.is-selected {
    color: var(--el-color-primary);
    font-weight: 600;
    background: var(--el-color-primary-light-9);
    box-shadow: inset 0 -3px 0 var(--el-color-primary);
  }
  svg {
    width: 12px;
    height: 12px;
    flex: 0 0 auto;
    color: var(--el-text-color-placeholder);
  }
}
.column-settings__preview-legend {
  display: grid;
  grid-template-columns: 1fr 1.5fr 1fr;
  margin-top: 6px;
  color: var(--el-text-color-placeholder);
  font-size: 11px;
  span:nth-child(2) {
    text-align: center;
  }
  span:last-child {
    text-align: right;
  }
}
.column-settings__toolbar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}
.column-settings__search {
  width: 250px;
}
.column-settings__filter-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.column-settings__workspace {
  height: 390px;
  min-height: 348px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
}
.column-settings__list-pane {
  height: 100%;
  min-width: 0;
}
.column-settings__list-head {
  display: grid;
  min-height: 34px;
  grid-template-columns: minmax(190px, 1fr) 76px 76px;
  gap: 8px;
  align-items: center;
  padding: 0 34px 0 16px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  background: var(--el-fill-color-extra-light);
  span:nth-child(n + 2) {
    text-align: right;
  }
}
.column-settings__groups {
  height: calc(100% - 34px);
  overflow-y: auto;
}
.column-settings__zone-header {
  display: flex;
  min-height: 32px;
  gap: 7px;
  align-items: center;
  padding: 0 14px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
  background: var(--el-fill-color-extra-light);
  small {
    margin-left: auto;
    color: var(--el-text-color-placeholder);
    font-weight: 400;
  }
}
.column-settings__zone-direction {
  color: var(--el-color-primary);
  font-size: 14px;
}
.column-settings__list {
  min-height: 2px;
  &.is-drop-ready {
    min-height: 38px;
    background: color-mix(in srgb, var(--el-color-primary) 5%, transparent);
  }
}
.column-settings__item:empty {
  display: none;
}
.column-settings__header-group {
  display: flex;
  min-height: 34px;
  gap: 8px;
  align-items: center;
  padding: 0 10px 0 14px;
  color: var(--el-text-color-regular);
  font-size: 12px;
  background: color-mix(in srgb, var(--el-color-primary) 5%, var(--el-bg-color));
  border-top: 1px solid var(--el-border-color-extra-light);
  border-bottom: 1px solid var(--el-border-color-extra-light);
  cursor: pointer;
  transition:
    color 0.15s,
    background-color 0.15s;
  &:hover {
    background: color-mix(in srgb, var(--el-color-primary) 9%, var(--el-bg-color));
  }
  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: -2px;
  }
  &.is-selected {
    color: var(--el-color-primary);
    background: color-mix(in srgb, var(--el-color-primary) 11%, var(--el-bg-color));
    box-shadow: inset 3px 0 0 var(--el-color-primary);
  }
  small {
    color: var(--el-text-color-placeholder);
    font-variant-numeric: tabular-nums;
  }
}
.column-settings__restore-group {
  margin-left: 0;
  padding: 2px 0;
  font-size: 12px;
}
.column-settings__header-group-name {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.column-settings__group-lock {
  margin-left: auto;
  padding: 2px 6px;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  background: var(--el-fill-color-light);
  border-radius: 999px;
}
.column-settings__row {
  display: grid;
  width: 100%;
  min-height: 42px;
  grid-template-columns: 28px 24px minmax(128px, 1fr) 76px 76px 18px;
  gap: 7px;
  align-items: center;
  padding: 0 10px 0 8px;
  color: var(--el-text-color-primary);
  cursor: pointer;
  background: var(--el-bg-color);
  border: 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  text-align: left;
  transition:
    background-color 0.15s,
    color 0.15s,
    opacity 0.15s;
  &.is-grouped {
    grid-template-columns: 24px minmax(128px, 1fr) 76px 76px 18px;
    padding-left: 24px;
  }
  &:hover {
    background: var(--el-fill-color-extra-light);
  }
  &:focus-visible {
    position: relative;
    outline: 2px solid var(--el-color-primary);
    outline-offset: -2px;
  }
  &.is-selected {
    color: var(--el-color-primary);
    background: color-mix(in srgb, var(--el-color-primary) 8%, var(--el-bg-color));
    box-shadow: inset 3px 0 0 var(--el-color-primary);
  }
  &.is-hidden:not(.is-selected) {
    color: var(--el-text-color-secondary);
    opacity: 0.68;
  }
}
.column-settings__drag {
  display: inline-flex;
  width: 28px;
  height: 28px;
  color: var(--el-text-color-placeholder);
  cursor: grab;
  border-radius: var(--el-border-radius-small);
  align-items: center;
  justify-content: center;
  svg {
    width: 16px;
    height: 16px;
  }
  &:hover {
    color: var(--el-color-primary);
    background: var(--el-fill-color-light);
  }
  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}
.column-settings__row-name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.column-settings__row-align {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  justify-content: flex-end;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.column-settings__align-glyph {
  display: inline-flex;
  width: 16px;
  flex-direction: column;
  gap: 2px;
  i {
    width: 12px;
    height: 1px;
    background: currentColor;
    border-radius: 1px;
  }
  i:nth-child(2) {
    width: 8px;
  }
  &.is-center {
    align-items: center;
  }
  &.is-right {
    align-items: flex-end;
  }
}
.column-settings__row-width {
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.column-settings__row-chevron {
  width: 14px;
  height: 14px;
  color: var(--el-text-color-placeholder);
}
.column-settings__row--ghost {
  opacity: 0.35;
  background: var(--el-color-primary-light-9);
}
.column-settings__row--chosen {
  box-shadow: inset 3px 0 0 var(--el-color-primary);
}
.column-settings__drop-message {
  padding: 9px 12px;
  color: var(--el-color-primary);
  font-size: 12px;
  text-align: center;
  border-top: 1px dashed var(--el-color-primary-light-5);
}
.column-settings__inspector {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  height: 100%;
  overflow-y: auto;
  background: var(--el-bg-color);
}
.column-settings__inspector-empty {
  display: grid;
  height: 100%;
  padding: 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  place-items: center;
}
.column-settings__inspector-title {
  display: grid;
  gap: 4px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  span,
  small {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
  strong {
    overflow: hidden;
    color: var(--el-text-color-primary);
    font-size: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.column-settings__setting-row {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  > div {
    display: grid;
    gap: 3px;
  }
}
.column-settings__setting-block {
  display: grid;
  gap: 10px;
}
.column-settings__setting-row,
.column-settings__setting-block {
  label {
    color: var(--el-text-color-primary);
    font-size: 13px;
    font-weight: 600;
  }
  small {
    color: var(--el-text-color-secondary);
    font-size: 12px;
    line-height: 1.5;
  }
}
.column-settings__fixed-control {
  display: flex;
  flex-wrap: wrap;
}
.column-settings__width-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.column-settings__width-input {
  width: 112px;
}
.column-settings__width-range {
  display: flex;
  justify-content: space-between;
  margin-top: -8px;
  color: var(--el-text-color-placeholder);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.column-settings__reset-column {
  align-self: flex-start;
  margin-top: auto;
}
.column-settings__footer {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
.column-settings__density,
.column-settings__footer-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.column-settings__density {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
@media (max-width: 900px) {
  .column-settings__workspace {
    height: 520px;
    min-height: 480px;
  }
  .column-settings__groups {
    height: calc(100% - 34px);
  }
}
@media (max-width: 767px) {
  .column-settings__preview-title,
  .column-settings__toolbar,
  .column-settings__footer {
    align-items: stretch;
    flex-direction: column;
  }
  .column-settings__search {
    width: 100%;
  }
  .column-settings__list-head {
    grid-template-columns: minmax(150px, 1fr) 64px 68px;
  }
  .column-settings__row {
    grid-template-columns: 24px 22px minmax(104px, 1fr) 64px 68px 14px;
    gap: 5px;
    padding-right: 6px;
  }
  .column-settings__row.is-grouped {
    grid-template-columns: 22px minmax(104px, 1fr) 64px 68px 14px;
  }
  .column-settings__row-align {
    font-size: 0;
  }
  .column-settings__footer-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}
@media (prefers-reduced-motion: reduce) {
  .column-settings__row,
  .column-settings__preview-cell {
    transition: none;
  }
}
</style>

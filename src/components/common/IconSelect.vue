<template>
  <div ref="iconSelectRef" :style="{ width: props.width }">
    <el-popover :visible="popoverVisible" :width="props.width" placement="bottom-end">
      <template #reference>
        <div @click="popoverVisible = !popoverVisible">
          <slot>
            <el-input v-model="selectedIcon" readonly placeholder="点击选择图标" class="reference">
              <template #prepend>
                <!-- 根据图标类型展示 -->
                <el-icon v-if="isElementIcon">
                  <component :is="selectedIcon.replace('el-icon-', '')" />
                </el-icon>
                <template v-else>
                  <div :class="`i-svg:${selectedIcon}`" />
                </template>
              </template>
              <template #suffix>
                <!-- 清空按钮 -->
                <el-icon
                  v-if="selectedIcon"
                  style="margin-right: 8px"
                  @click.stop="clearSelectedIcon"
                >
                  <CircleClose />
                </el-icon>

                <el-icon
                  :style="{
                    transform: popoverVisible ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform .5s',
                  }"
                >
                  <ArrowDown @click.stop="togglePopover" />
                </el-icon>
              </template>
            </el-input>
          </slot>
        </div>
      </template>

      <!-- 图标选择弹窗 -->
      <div ref="popoverContentRef">
        <el-input v-model="filterText" placeholder="搜索图标" clearable @input="filterIcons" />
        <el-tabs v-model="activeTab" @tab-click="handleTabClick">
          <el-tab-pane label="SVG 图标" name="svg">
            <el-scrollbar height="300px">
              <ul class="icon-grid">
                <li
                  v-for="icon in filteredSvgIcons"
                  :key="'svg-' + icon"
                  class="icon-grid-item"
                  @click="selectIcon(icon)"
                >
                  <el-tooltip :content="icon" placement="bottom" effect="light">
                    <div :class="`i-svg:${icon}`" />
                  </el-tooltip>
                </li>
              </ul>
            </el-scrollbar>
          </el-tab-pane>
          <el-tab-pane label="Element 图标" name="element">
            <el-scrollbar height="300px">
              <ul class="icon-grid">
                <li
                  v-for="icon in filteredElementIcons"
                  :key="icon"
                  class="icon-grid-item"
                  @click="selectIcon(icon)"
                >
                  <el-icon>
                    <component :is="icon" />
                  </el-icon>
                </li>
              </ul>
            </el-scrollbar>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import type { TabsPaneContext } from "element-plus";

const props = defineProps({
  modelValue: {
    type: String,
    default: "",
  },
  width: {
    type: String,
    default: "500px",
  },
});

const emit = defineEmits(["update:modelValue"]);

/** 图标选择触发器，点击外部时以它判断是否应收起弹层。 */
const iconSelectRef = ref();
/** 图标弹层内容元素，点击内部不应被外部点击监听误判为关闭。 */
const popoverContentRef = ref();
/** 控制图标面板的打开状态，选中后自动收起。 */
const popoverVisible = ref(false);
/** 当前查看项目 SVG 还是 Element Plus 图标，影响筛选数据及保存名称格式。 */
const activeTab = ref("svg");

/** 从项目 icons 目录读取的 SVG 文件名列表，不包含扩展名。 */
const svgIcons = ref<string[]>([]);
/** Element Plus 导出的图标组件名称，作为内置图标候选。 */
const elementIcons = ref<string[]>(Object.keys(ElementPlusIconsVue));
/** 父页面双向绑定的图标名称，Element Plus 图标使用 el-icon- 前缀。 */
const selectedIcon = defineModel("modelValue", {
  type: String,
  required: true,
  default: "",
});

/** 图标名称搜索关键词，只过滤当前页签的候选。 */
const filterText = ref("");
/** 符合关键词的项目 SVG 图标，用于面板展示。 */
const filteredSvgIcons = ref<string[]>([]);
/** 符合关键词的 Element Plus 图标，用于面板展示。 */
const filteredElementIcons = ref<string[]>(elementIcons.value);
/** 根据名称前缀选择正确的图标渲染方式，避免把内置图标当作 SVG 文件。 */
const isElementIcon = computed(() => {
  return selectedIcon.value && selectedIcon.value.startsWith("el-icon");
});

/** 读取构建工具发现的 SVG 路径，提取名称并初始化候选列表。 */
function loadIcons() {
  const icons = import.meta.glob("/src/assets/icons/*.svg");
  for (const path in icons) {
    const iconName = path.replace(/.*\/(.*)\.svg$/, "$1");
    svgIcons.value.push(iconName);
  }
  filteredSvgIcons.value = svgIcons.value;
}

/** 只接受两个已知页签，切换后按当前关键词刷新候选。 */
function handleTabClick(tabPane: TabsPaneContext) {
  if (tabPane.props.name !== "svg" && tabPane.props.name !== "element") return;
  activeTab.value = tabPane.props.name;
  filterIcons();
}

/** 忽略大小写过滤当前类型的图标名称，空关键词显示全部。 */
function filterIcons() {
  if (activeTab.value === "svg") {
    filteredSvgIcons.value = filterText.value
      ? svgIcons.value.filter((icon) => icon.toLowerCase().includes(filterText.value.toLowerCase()))
      : svgIcons.value;
  } else {
    filteredElementIcons.value = filterText.value
      ? elementIcons.value.filter((icon) =>
          icon.toLowerCase().includes(filterText.value.toLowerCase())
        )
      : elementIcons.value;
  }
}

/** 给内置图标补上保存前缀，通知父页面并关闭面板。 */
function selectIcon(icon: string) {
  const iconName = activeTab.value === "element" ? "el-icon-" + icon : icon;
  emit("update:modelValue", iconName);
  popoverVisible.value = false;
}

/** 切换图标面板开关，不改变当前选中的图标。 */
function togglePopover() {
  popoverVisible.value = !popoverVisible.value;
}

/** 点击触发器和弹层之外时收起面板，弹层内选择图标不被提前打断。 */
onClickOutside(iconSelectRef, () => (popoverVisible.value = false), {
  ignore: [popoverContentRef],
});

/**
 * 清空已选图标
 */
function clearSelectedIcon() {
  selectedIcon.value = "";
}

/** 加载项目 SVG 图标，并按已有值自动选中对应的图标类型页签。 */
onMounted(() => {
  loadIcons();
  if (selectedIcon.value) {
    if (elementIcons.value.includes(selectedIcon.value.replace("el-icon-", ""))) {
      activeTab.value = "element";
    } else {
      activeTab.value = "svg";
    }
  }
});
</script>

<style scoped lang="scss">
.reference :deep(.el-input__wrapper),
.reference :deep(.el-input__inner) {
  cursor: pointer;
}

.icon-grid {
  display: flex;
  flex-wrap: wrap;
}

.icon-grid-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  margin: 4px;
  cursor: pointer;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  transition: all 0.3s;
}

.icon-grid-item:hover {
  border-color: var(--el-color-primary);
  transform: scale(1.2);
}
</style>

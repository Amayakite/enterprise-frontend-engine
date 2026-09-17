<template>
  <div class="region-cascader">
    <el-cascader
      :key="cascaderRevision"
      :model-value="selectedPath"
      :options="options"
      :props="cascaderProps"
      :placeholder="placeholder ?? '请选择省/市/区'"
      :disabled="readonly"
      clearable
      filterable
      :show-all-levels="true"
      style="width: 100%"
      @change="commit"
    />
    <div v-if="errorMessage" class="region-feedback region-feedback--error" role="alert">
      <span>{{ errorMessage }}</span>
      <el-button link type="primary" @click="retry">重试</el-button>
    </div>
    <div v-else-if="noData" class="region-feedback">当前范围暂无可选地区</div>
  </div>
</template>

<script setup lang="ts">
import type { CascaderOption, CascaderProps } from "element-plus";
import { serializeStableKey } from "@/utils/identity";
import type { RegionCascaderSource, RegionId, RegionOption } from "./types";

type CascaderNode = CascaderOption & { value: RegionId; label: string; children?: CascaderNode[] };

const props = defineProps<{
  /** 已选择的末级地区 ID（v-model）；未选择为 null。 */
  modelValue: RegionId | null;
  /** 省市区层级数据源及按级加载方法。 */
  source: RegionCascaderSource;
  /** 获取地区数据时附带的业务筛选条件。 */
  filters: unknown;
  /** 是否只读展示地区路径。 */
  readonly: boolean;
  /** 未选择时的输入提示。 */
  placeholder?: string;
}>();
const emit = defineEmits<{
  /**
   * 用户选定或清空地区，携带末级 ID 和完整层级记录；宿主可在此回填省、市、区 ID 和名称。
   * @example `<RegionCascader @change="(id, items) => writeRegionFields(id, items)" />`
   */
  change: [value: RegionId | null, items: readonly RegionOption[]];
}>();

const options = ref<CascaderNode[]>([]);
const selectedPath = ref<RegionId[]>([]);
const loadedChildren = new Map<string, readonly RegionOption[]>();
const cascaderRevision = ref(0);
const loadError = ref("");
const hydrateError = ref("");
const errorMessage = computed(() => hydrateError.value || loadError.value);
const noData = ref(false);
let controller: AbortController | undefined;
let revision = 0;
let alive = true;

function childrenKey(parentId: RegionId | null, level: number) {
  return `${level}:${parentId === null ? "root" : serializeStableKey(parentId)}`;
}

function toNodes(items: readonly RegionOption[], level: number): CascaderNode[] {
  return items.map((item) => ({
    value: item.id,
    label: item.name,
    leaf: level >= props.source.depth - 1,
  }));
}

async function load(parentId: RegionId | null, level: number): Promise<CascaderNode[]> {
  const current = revision;
  const result = await props.source.loadChildren(
    parentId,
    level,
    props.filters,
    controller?.signal
  );
  if (!alive || current !== revision) return [];
  loadedChildren.set(childrenKey(parentId, level), result);
  loadError.value = "";
  if (level === 0) noData.value = result.length === 0;
  return toNodes(result, level);
}

const cascaderProps = computed<CascaderProps>(() => ({
  lazy: true,
  emitPath: true,
  lazyLoad: async (node, resolve, reject) => {
    const current = revision;
    try {
      const parentId = node.level === 0 ? null : (node.value as RegionId);
      resolve(await load(parentId, node.level));
    } catch {
      // 使用公开拒绝回调恢复节点 loading，禁止通过自动重挂导致失败请求无限重试。
      reject();
      if (alive && current === revision && !controller?.signal.aborted) {
        noData.value = false;
        loadError.value = "地区加载失败，请重试";
      }
    }
  },
}));

function findNode(nodes: CascaderNode[], id: RegionId): CascaderNode | undefined {
  return nodes.find((node) => node.value === id);
}

function insertPath(path: readonly RegionOption[]) {
  let current = options.value;
  path.forEach((item, index) => {
    let node = findNode(current, item.id);
    if (!node) {
      node = { value: item.id, label: item.name, leaf: index >= props.source.depth - 1 };
      current.push(node);
    }
    if (index < path.length - 1) current = node.children ??= [];
  });
}

function optionsForPath(path: readonly RegionId[]): RegionOption[] {
  const result: RegionOption[] = [];
  let parentId: RegionId | null = null;
  for (const [level, id] of path.entries()) {
    const item: RegionOption | undefined = loadedChildren
      .get(childrenKey(parentId, level))
      ?.find((candidate) => candidate.id === id);
    if (!item) return [];
    result.push(item);
    parentId = item.id;
  }
  return result;
}

function commit(value: unknown) {
  const path = Array.isArray(value) ? (value as RegionId[]) : [];
  if (!path.length) {
    selectedPath.value = [];
    emit("change", null, []);
    return;
  }
  if (path.length !== props.source.depth) return;
  const items = optionsForPath(path);
  if (items.length !== props.source.depth) return;
  selectedPath.value = [...path];
  emit("change", path.at(-1)!, items);
}

async function hydrate() {
  controller?.abort();
  const activeController = new AbortController();
  controller = activeController;
  const current = ++revision;
  selectedPath.value = [];
  hydrateError.value = "";
  noData.value = false;
  if (props.modelValue === null || props.modelValue === undefined || props.modelValue === "") {
    return;
  }
  if (!props.source.resolvePath) {
    hydrateError.value = "当前地区数据源不支持编辑回显";
    return;
  }
  try {
    const path = await props.source.resolvePath(
      props.modelValue,
      props.filters,
      activeController.signal
    );
    if (!alive || current !== revision) return;
    if (path.length !== props.source.depth || path.at(-1)?.id !== props.modelValue) {
      hydrateError.value = "未找到当前地区的完整路径，请重试";
      return;
    }
    insertPath(path);
    path.forEach((item, level) => {
      const parentId = level === 0 ? null : path[level - 1]!.id;
      const key = childrenKey(parentId, level);
      const loaded = loadedChildren.get(key) ?? [];
      if (!loaded.some((candidate) => candidate.id === item.id))
        loadedChildren.set(key, [...loaded, item]);
    });
    selectedPath.value = path.map((item) => item.id);
  } catch {
    if (alive && current === revision && !activeController.signal.aborted)
      hydrateError.value = "地区回显失败，原字段值已保留，请重试";
  }
}

function retry() {
  noData.value = false;
  if (hydrateError.value) {
    hydrateError.value = "";
    void hydrate();
    return;
  }
  loadError.value = "";
  // 无已选值时重建公开级联组件，根节点会在用户再次展开时重新请求。
  cascaderRevision.value++;
}

watch(
  () => props.modelValue,
  () => void hydrate()
);
watch(
  () => [props.filters, props.source] as const,
  () => {
    // 组织、租户或 source 改变时不得复用上一范围加载的候选树。
    options.value = [];
    loadedChildren.clear();
    loadError.value = "";
    cascaderRevision.value++;
    void hydrate();
  },
  { immediate: true, deep: true }
);
onBeforeUnmount(() => {
  alive = false;
  revision++;
  controller?.abort();
});
</script>

<style scoped>
.region-cascader {
  width: 100%;
}
.region-feedback {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 20px;
}
.region-feedback--error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--el-color-danger);
}
</style>

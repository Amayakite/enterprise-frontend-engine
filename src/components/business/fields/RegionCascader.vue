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
   * 用户选定或清空地区，携带末级 ID 和完整层级记录；调用方可在此回填省、市、区 ID 和名称。
   * @example `<RegionCascader @change="(id, items) => writeRegionFields(id, items)" />`
   */
  change: [value: RegionId | null, items: readonly RegionOption[]];
}>();

/** 级联选择器当前已加载的地区树，既包含逐级候选，也可能包含编辑回显补入的路径。 */
const options = ref<CascaderNode[]>([]);
/** 控件使用的完整省市区 ID 路径；对外只提交最后一级 ID。 */
const selectedPath = ref<RegionId[]>([]);
/** 按父级 ID 和层级记录已加载地区，选中完整路径时用来回填名称。 */
const loadedChildren = new Map<string, readonly RegionOption[]>();
/** 需要重新加载候选时改变组件 key，以清除级联控件内部的旧节点。 */
const cascaderRevision = ref(0);
/** 逐级展开候选失败的提示，允许重试而不删除已有字段值。 */
const loadError = ref("");
/** 按已有 ID 回显完整路径失败的提示，与候选加载错误分开处理。 */
const hydrateError = ref("");
/** 优先显示回显错误，否则显示候选加载错误，统一放在控件旁。 */
const errorMessage = computed(() => hydrateError.value || loadError.value);
/** 根级查询成功但没有地区时显示空数据提示，与请求失败区分。 */
const noData = ref(false);
/** 取消当前回显和同轮候选请求，数据源或范围变化时终止旧请求。 */
let controller: AbortController | undefined;
/** 地区加载轮次，迟到的旧响应不能写入新范围的树。 */
let revision = 0;
/** 组件是否尚未卸载，异步结束时检查以免写回失效界面。 */
let alive = true;

/** 将层级和父级 ID 组成缓存键，保留数字与字符串 ID 的区别。 */
function childrenKey(parentId: RegionId | null, level: number) {
  return `${level}:${parentId === null ? "root" : serializeStableKey(parentId)}`;
}

/** 把业务地区记录转成级联节点，达到配置深度后标记为叶子。 */
function toNodes(items: readonly RegionOption[], level: number): CascaderNode[] {
  return items.map((item) => ({
    value: item.id,
    label: item.name,
    leaf: level >= props.source.depth - 1,
  }));
}

/** 按父级加载一级候选，确认请求未过期后保存名称信息并生成控件节点。 */
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

/** 配置懒加载和完整路径输出；请求失败时结束节点加载状态并显示可重试错误。 */
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

/** 在当前一级节点中按 ID 查找，编辑回显时避免重复插入同一地区。 */
function findNode(nodes: CascaderNode[], id: RegionId): CascaderNode | undefined {
  return nodes.find((node) => node.value === id);
}

/** 把已有记录的完整地区路径补入候选树，使未展开过的地区也能显示名称。 */
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

/** 从已加载记录还原选择路径的 ID 和名称，路径缺少任一级则拒绝回填。 */
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

/** 只有完整地区路径才提交末级 ID 和路径记录；清空时提交 null 和空数组。 */
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

/** 根据已有末级 ID 读取完整路径并回显；失败时保留外部字段值，允许用户重试。 */
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

/** 按失败类型重试路径回显或重建候选树，不自动无限重复请求。 */
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

/** 父页面替换地区 ID 后重新回显路径，包括加载记录和恢复草稿。 */
watch(
  () => props.modelValue,
  () => void hydrate()
);
/** 组织条件或数据源变化时清空旧候选，并在新范围内重新解析已有 ID。 */
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
/** 卸载后禁止旧响应写回，并取消尚未结束的地区请求。 */
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

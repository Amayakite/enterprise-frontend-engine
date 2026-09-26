<template>
  <nav
    v-show="!hidden"
    class="pagination"
    :class="{ 'pagination--compact': compact }"
    aria-label="分页导航"
  >
    <el-pagination
      :current-page="currentPage"
      :page-size="pageSize"
      :background="background"
      :layout="layout"
      :page-sizes="pageSizes"
      :pager-count="5"
      :total="total"
      :disabled="disabled"
      @update:page-size="handleSizeChange"
      @update:current-page="handleCurrentChange"
    >
      <slot />
    </el-pagination>
  </nav>
</template>

<script setup lang="ts">
const props = defineProps({
  total: {
    type: Number as PropType<number>,
    default: 0,
  },
  pageSizes: {
    type: Array as PropType<number[]>,
    default() {
      return [10, 20, 30, 50];
    },
  },
  layout: {
    type: String,
    default: "total, sizes, prev, pager, next, jumper",
  },
  background: {
    type: Boolean,
    default: true,
  },
  autoScroll: {
    type: Boolean,
    default: true,
  },
  hidden: {
    type: Boolean,
    default: false,
  },
  disabled: { type: Boolean, default: false },
  /** 紧凑工具栏模式，默认 false；取消上下留白并左对齐，适合与确认按钮共用一行。 */
  compact: { type: Boolean, default: false },
});

const emit = defineEmits<{
  /**
   * 页码或每页条数的逻辑变更；修改每页条数时 page 固定回到 1。
   * @example `<Pagination @pagination="({ page, limit }) => controller.setPage(page, limit)" />`
   */
  pagination: [value: { page: number; limit: number }];
}>();

/** 与父页面双向绑定的当前页码，从 1 开始；真正接受分页后才更新。 */
const currentPage = defineModel("page", {
  type: Number,
  required: true,
  default: 1,
});

/** 与父页面双向绑定的每页条数，调整条数会回到第一页。 */
const pageSize = defineModel("limit", {
  type: Number,
  required: true,
  default: 10,
});

// Element Plus 在改页大小时还会调整 currentPage；同一轮只发布一次逻辑分页。
let queued: { page: number; limit: number; resized: boolean } | undefined;
/** 标记分页组件是否仍存在，微任务执行前检查，避免卸载后继续通知。 */
let alive = true;
/** 标记已卸载，丢弃排队但尚未发布的分页事件。 */
onBeforeUnmount(() => {
  alive = false;
});
/** 把同轮页码和条数变化合并成一次通知，条数变化优先回到第一页。 */
function queue(page: number, limit: number, resized = false) {
  if (props.disabled) return;
  const scheduled = !!queued;
  queued = {
    page: resized || queued?.resized ? 1 : page,
    limit,
    resized: resized || !!queued?.resized,
  };
  if (scheduled) return;
  queueMicrotask(() => {
    const next = queued;
    queued = undefined;
    if (!alive || props.disabled || !next) return;
    if (next.page === currentPage.value && next.limit === pageSize.value) return;
    currentPage.value = next.page;
    pageSize.value = next.limit;
    emit("pagination", { page: next.page, limit: next.limit });
  });
}
/** 总条数减少导致当前页超出范围时，自动请求回到最后有效页。 */
watch(
  () => props.total,
  (newVal: number) => {
    const lastPage = Math.max(1, Math.ceil(newVal / pageSize.value));
    if (currentPage.value > lastPage) {
      queue(lastPage, pageSize.value);
    }
  }
);

/** 改变每页条数时排队更新并回到第一页，避免短页下超出范围。 */
function handleSizeChange(val: number) {
  queue(1, val, true);
}

/** 排队处理页码变化，如果同轮也改条数则使用最新条数。 */
function handleCurrentChange(val: number) {
  queue(val, queued?.limit ?? pageSize.value);
}
</script>

<style lang="scss" scoped>
.pagination {
  &.pagination--compact {
    padding: 0;
    justify-content: flex-start;
  }
  display: flex;
  justify-content: flex-end;
  width: 100%;
  min-width: 0;
  padding: 8px 0;
  :deep(.el-pagination) {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px 4px;
    max-width: 100%;
    white-space: normal;
  }
  :deep(.el-pagination > *) {
    margin: 0;
  }
  :deep(.el-pagination__sizes) {
    margin: 0 4px;
  }
  @media (max-width: 480px) {
    :deep(.el-pagination) {
      row-gap: 10px;
    }
    :deep(.el-pagination__total) {
      margin-right: auto;
    }
  }
}
</style>

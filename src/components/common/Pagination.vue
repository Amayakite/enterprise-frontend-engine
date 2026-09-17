<template>
  <nav v-show="!hidden" class="pagination" aria-label="分页导航">
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
    />
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
});

const emit = defineEmits<{
  /**
   * 页码或每页条数的逻辑变更；修改每页条数时 page 固定回到 1。
   * @example `<Pagination @pagination="({ page, limit }) => controller.setPage(page, limit)" />`
   */
  pagination: [value: { page: number; limit: number }];
}>();

const currentPage = defineModel("page", {
  type: Number,
  required: true,
  default: 1,
});

const pageSize = defineModel("limit", {
  type: Number,
  required: true,
  default: 10,
});

// Element Plus 在改页大小时还会调整 currentPage；同一轮只发布一次逻辑分页。
let queued: { page: number; limit: number; resized: boolean } | undefined;
let alive = true;
onBeforeUnmount(() => {
  alive = false;
});
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
watch(
  () => props.total,
  (newVal: number) => {
    const lastPage = Math.max(1, Math.ceil(newVal / pageSize.value));
    if (currentPage.value > lastPage) {
      queue(lastPage, pageSize.value);
    }
  }
);

function handleSizeChange(val: number) {
  queue(1, val, true);
}

function handleCurrentChange(val: number) {
  queue(val, queued?.limit ?? pageSize.value);
}
</script>

<style lang="scss" scoped>
.pagination {
  display: flex;
  justify-content: flex-end;
  width: 100%;
  min-width: 0;
  padding: 12px 0;
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

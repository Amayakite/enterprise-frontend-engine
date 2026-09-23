import { onScopeDispose, reactive, ref, type Ref } from "vue";
import { createRequestChannel } from "@/utils/request-channel";

import type { BaseQueryParams, PageResult } from "@/types/http";

/**
 * 管理传统分页列表的请求、参数和加载状态。
 *
 * @typeParam T 列表行类型。
 * @typeParam Q 查询参数类型，必须包含分页字段。
 * @param options 初始参数、请求函数及可选重置前回调。
 * @returns 稳定的响应式分页状态和查询动作。
 * @remarks 仅最新请求可回填；新请求及作用域销毁会取消旧通道，不管理勾选、弹窗或表单。
 * `resetParams` 不发请求，`handleResetQuery` 才会重置后请求。
 * @example
 * ```ts
 * const table = usePageTable<CustomerRow, CustomerQuery>({
 *   initialParams: { pageNum: 1, pageSize: 20, keyword: "" },
 *   request: getCustomerPage,
 * });
 * await table.fetchData();
 * ```
 */
export function usePageTable<T, Q extends BaseQueryParams = BaseQueryParams>(
  options: UsePageTableOptions<T, Q>
): UsePageTableReturn<T, Q> {
  /** 取出初始参数、分页接口及重置前同步 UI 的可选回调。 */
  const { initialParams, request, onBeforeReset } = options;

  /** 最近一次分页请求是否进行中，旧请求结束不会清除新请求的忙碌状态。 */
  const loading = ref(false);
  /** 当前成功请求得到的一页记录，保留泛型行类型供表格读取。 */
  const list = ref<T[]>([]) as Ref<T[]>;
  /** 接口返回的总条数，供分页控件计算总页数。 */
  const total = ref(0);
  /** 当前可修改的查询参数，初始值来自 initialParams，重置时保留对象引用。 */
  const params = reactive({ ...initialParams }) as Q;
  /** 取消并标记过期分页请求，只让最新请求回填列表。 */
  const channel = createRequestChannel();
  /** 页面销毁时取消请求并结束加载状态。 */
  onScopeDispose(() => {
    channel.cancel();
    loading.value = false;
  });

  /**
   * 拉取当前查询参数对应的分页数据
   *
   * 只负责请求和回填，不处理弹窗、路由或消息提示
   */
  async function fetchData(): Promise<void> {
    const run = channel.start();
    loading.value = true;
    try {
      const data = await request({ ...params }, run.signal);
      if (!run.isCurrent()) return;
      list.value = data.list ?? [];
      total.value = data.total ?? 0;
    } catch (error) {
      if (run.isCurrent()) throw error;
    } finally {
      if (run.isCurrent()) loading.value = false;
    }
  }

  /**
   * 回到第一页并查询
   */
  function handleQuery(): Promise<void> {
    params.pageNum = 1;
    return fetchData();
  }

  /**
   * 恢复初始查询参数
   *
   * 保持响应式引用不变，不触发查询
   */
  function resetParams(): void {
    Object.assign(params, initialParams);
  }

  /**
   * 恢复初始查询参数并重新查询
   */
  function handleResetQuery(): Promise<void> {
    onBeforeReset?.();
    resetParams();
    return fetchData();
  }

  return {
    loading,
    list,
    total,
    params,
    fetchData,
    handleQuery,
    handleResetQuery,
    resetParams,
  };
}

export interface UsePageTableOptions<T, Q extends BaseQueryParams> {
  /** 初始查询参数，同时作为重置基准；不要在调用后原地修改它。 */
  initialParams: Q;
  /** 接收参数浅快照和取消信号，返回标准 PageResult；旧 API 可忽略 signal，迟到结果仍被丢弃。 */
  request: (params: Q, signal: AbortSignal) => Promise<PageResult<T>>;
  /**
   * 重置查询前的回调
   *
   * 常用于同步重置搜索表单字段
   */
  onBeforeReset?: () => void;
}

export interface UsePageTableReturn<T, Q extends BaseQueryParams> {
  /** 最新查询是否进行中；保存操作须使用独立状态。 */
  loading: Ref<boolean>;
  /** 当前页数据列表，由最近一次成功请求覆盖。 */
  list: Ref<T[]>;
  /** 后端返回的总条数。 */
  total: Ref<number>;
  /** 当前查询参数 */
  params: Q;
  /**
   * 拉取分页数据
   */
  fetchData: () => Promise<void>;
  /**
   * 回到第一页并查询
   */
  handleQuery: () => Promise<void>;
  /**
   * 恢复初始参数并重新查询
   */
  handleResetQuery: () => Promise<void>;
  /**
   * 恢复初始参数但不触发查询
   */
  resetParams: () => void;
}

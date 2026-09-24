import { feedback } from "@/utils/feedback";
import { computed, onMounted, ref } from "vue";
import type { NoticeDetail, NoticeItem, NoticeQueryParams } from "@/api/system/notice";
import NoticeAPI from "@/api/system/notice";
import router from "@/router";

/** 下拉面板每页展示条数 */
const PAGE_SIZE = 5;

/** 通知读取状态：0=未读，1=已读 */
type NoticeStatus = 0 | 1;

/**
 * 通知下拉面板的响应式数据与业务逻辑
 * 挂载和打开面板时通过普通接口刷新。
 */
export function useNotice() {
  /** 当前 Tab 下的通知列表（最多 PAGE_SIZE 条） */
  const list = ref<NoticeItem[]>([]);
  /** 未读通知总数（红点/角标数字） */
  const unreadTotal = ref(0);
  /** 当前激活的 Tab：0=未读，1=已读 */
  const activeStatus = ref<NoticeStatus>(0);
  /** 查看详情时加载的完整通知数据 */
  const detail = ref<NoticeDetail | null>(null);
  /** 详情弹窗可见性 */
  const dialogVisible = ref(false);
  /** 列表为空时的占位文案，根据当前 Tab 切换 */
  const emptyText = computed(() => (activeStatus.value === 0 ? "暂无未读消息" : "暂无已读消息"));

  /**
   * 拉取通知分页列表
   * 查询未读 Tab 时同步更新 unreadTotal
   */
  async function fetchList(params?: Partial<NoticeQueryParams>) {
    const query: NoticeQueryParams = {
      pageNum: 1,
      pageSize: PAGE_SIZE,
      isRead: activeStatus.value,
      ...params,
    };
    const page = await NoticeAPI.getMyNoticePage(query);
    list.value = page.list || [];

    if (query.isRead === 0) {
      unreadTotal.value = page.total ?? 0;
    }
  }

  /** 仅查询未读通知总数（不更新列表），用于切换到已读 Tab 后刷新角标 */
  async function fetchUnreadTotal() {
    const page = await NoticeAPI.getMyNoticePage({
      pageNum: 1,
      pageSize: 1,
      isRead: 0,
    });
    unreadTotal.value = page.total ?? 0;
  }

  /**
   * 切换未读/已读 Tab
   * 同一 Tab 重复点击不重复请求
   */
  async function switchStatus(status: NoticeStatus) {
    if (activeStatus.value === status) return;

    activeStatus.value = status;
    await fetchList();
  }

  /**
   * 刷新数据
   * 未读 Tab：刷新列表即可；已读 Tab：额外刷新未读总数以更新角标
   */
  async function refresh() {
    await Promise.all([
      fetchList(),
      activeStatus.value === 0 ? Promise.resolve() : fetchUnreadTotal(),
    ]);
  }

  /**
   * 点击单条通知查看详情
   * 1. 标记原列表项是否为未读
   * 2. 拉取详情并打开弹窗
   * 3. 从当前列表中移除该项（下拉面板内不再显示）
   * 4. 若为未读，本地角标 -1
   * 5. 刷新数据与角标
   */
  async function read(id: string) {
    const item = list.value.find((notice: NoticeItem) => notice.id === id);
    const wasUnread = item?.isRead !== 1;

    detail.value = await NoticeAPI.getDetail(id);
    dialogVisible.value = true;

    const idx = list.value.findIndex((item: NoticeItem) => item.id === id);
    if (idx >= 0) list.value.splice(idx, 1);
    if (wasUnread && unreadTotal.value > 0) unreadTotal.value -= 1;

    await refresh();
  }

  /** 全部标为已读：调用接口 + 清空本地未读数 + 刷新列表 */
  async function readAll() {
    if (unreadTotal.value <= 0) return;

    await NoticeAPI.readAll();
    unreadTotal.value = 0;
    if (activeStatus.value === 0) {
      list.value = [];
    } else {
      await fetchList();
    }
    feedback.success("已全部标记为已读");
  }

  /** 跳转到通知列表页 */
  function goMore() {
    router.push({ name: "MyNotice" });
  }

  onMounted(() => {
    refresh();
  });

  return {
    list,
    unreadTotal,
    activeStatus,
    emptyText,
    detail,
    dialogVisible,
    fetchList,
    switchStatus,
    refresh,
    read,
    readAll,
    goMore,
  };
}

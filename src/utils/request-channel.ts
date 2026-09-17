/**
 * 创建单通道请求控制器，用于只保留最新一次搜索/回显请求。
 *
 * @returns cancel 与 start；start 会自动取消上一次请求，isCurrent 用于忽略不能取消的迟到响应。
 * @remarks 不会自行处理错误或写入状态；调用方仍要在卸载时调用 cancel。
 * @example
 * ```ts
 * const channel = createRequestChannel();
 * const run = channel.start();
 * const result = await request({ signal: run.signal });
 * if (run.isCurrent()) rows.value = result.list;
 * ```
 */
export function createRequestChannel() {
  let sequence = 0;
  let controller: AbortController | undefined;
  function cancel() {
    sequence++;
    controller?.abort();
    controller = undefined;
  }
  return {
    cancel,
    start() {
      cancel();
      const version = sequence;
      const current = new AbortController();
      controller = current;
      return {
        signal: current.signal,
        isCurrent: () => sequence === version && !current.signal.aborted,
      };
    },
  };
}

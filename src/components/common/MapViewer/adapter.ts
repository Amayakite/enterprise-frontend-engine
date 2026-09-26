import type { MapCredential, MapGeometry, MapPoint, MapProvider, MapSession } from "./types";
import { MapServiceError } from "./key-pool";
import { waitFor } from "./runtime/helpers";

/**
 * 在独立同源页面运行官方地图依赖，支持同页多个实例及不同 Key，避免全局加载器相互覆盖。
 * SDK 加载、覆盖物和绘制由运行页中的官方依赖处理；这里仅处理生命周期和取消。
 */
export async function createMapSession(
  container: HTMLElement,
  provider: MapProvider,
  credential: MapCredential,
  signal: AbortSignal,
  onPoint: (point: MapPoint) => void,
  onGeometry: (geometry: MapGeometry) => void,
  onDrawError: (message: string) => void
): Promise<MapSession> {
  const frame = document.createElement("iframe");
  frame.title = provider === "amap" ? "高德地图" : "腾讯地图";
  frame.className = "map-viewer__frame";
  let runtime: MapSession | undefined;
  const destroy = () => {
    signal.removeEventListener("abort", destroy);
    runtime?.destroy();
    runtime = undefined;
    frame.remove();
  };
  signal.addEventListener("abort", destroy, { once: true });
  try {
    await waitFor(
      signal,
      (resolve, reject) => {
        frame.onload = () => resolve(true);
        frame.onerror = () => reject(new MapServiceError("地图运行页面加载失败"));
        frame.src = `${import.meta.env.BASE_URL}map-runtime.html`;
        container.append(frame);
      },
      "地图运行页面加载超时"
    );
    const init = frame.contentWindow?.createMapRuntime;
    if (!init) throw new MapServiceError("地图运行页面未就绪，请刷新后重试");
    runtime = await waitFor<MapSession>(
      signal,
      (resolve, reject) => {
        void init({ provider, credential, onPoint, onGeometry, onDrawError })
          .then((session) => {
            if (signal.aborted || !frame.isConnected) {
              session.destroy();
              return;
            }
            resolve(session);
          })
          .catch(() => reject(new MapServiceError("地图初始化失败，请检查凭证与网络")));
      },
      "地图初始化超时，请检查凭证与网络"
    );
    const active = runtime;
    return {
      ...active,
      // 子窗口 Error 的原型与主窗口不同，只传递约定中的安全错误，不回显原始 SDK 错误。
      search: async (keyword, city) => {
        try {
          return await active.search(keyword, city);
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "name" in error &&
            error.name === "MapServiceError" &&
            "message" in error &&
            typeof error.message === "string" &&
            "kind" in error
          ) {
            throw new MapServiceError(
              error.message,
              error.kind === "credential" ? "credential" : "transient"
            );
          }
          throw new MapServiceError("地图搜索失败，请稍后重试");
        }
      },
      destroy,
    };
  } catch (error) {
    destroy();
    throw error;
  }
}

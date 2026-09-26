import { createApp, h } from "vue";
import type { MapRuntimeOptions, MapSession } from "../types";
import "./runtime.scss";

/** 同源运行入口：在 iframe 自己的 JS 环境中实例化依赖，免去跨窗口 SDK 对象兼容补丁。 */
window.createMapRuntime = async (input: MapRuntimeOptions): Promise<MapSession> => {
  const host = document.getElementById("map-runtime");
  if (!host) throw new Error("地图容器不存在");
  const options = { ...input, credential: structuredClone(input.credential) };
  if (options.provider === "amap") {
    const { mountAmap } = await import("./amap");
    return mountAmap(host, options);
  }
  const { default: TencentMap } = await import("./TencentMap.vue");
  return new Promise((resolve, reject) => {
    const app = createApp({
      render: () =>
        h(TencentMap, {
          options,
          ready: (session: MapSession) =>
            resolve({
              ...session,
              destroy: () => {
                session.destroy();
                app.unmount();
              },
            }),
        }),
    });
    app.config.errorHandler = () => reject(new Error("腾讯地图组件初始化失败"));
    app.mount(host);
  });
};

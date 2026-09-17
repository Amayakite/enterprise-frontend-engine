import { defineMock } from "./base";
import { readLabControls, resolveLab, searchLab } from "./reference-data";

export default defineMock([
  {
    url: "lab/references/:source/:operation",
    method: ["POST"],
    async body({ params, body }) {
      try {
        const controls = readLabControls(body?.controls);
        await new Promise((resolve) => setTimeout(resolve, controls.delayMs));
        if (controls.fail || (controls.failResolve && params.operation === "resolve"))
          throw new Error("实验主动失败");
        const data =
          params.operation === "search"
            ? searchLab(params.source, body.query, controls.empty, controls.duplicate)
            : params.operation === "resolve"
              ? resolveLab(
                  params.source,
                  body.ids,
                  body.filters,
                  controls.empty,
                  controls.partialUnavailable,
                  controls.duplicate
                )
              : undefined;
        if (!data) throw new Error("未知实验操作");
        return { code: "00000", data, msg: "成功" };
      } catch (error) {
        return {
          code: "LAB_CONTRACT_ERROR",
          data: null,
          msg: error instanceof Error ? error.message : "实验请求失败",
        };
      }
    },
  },
]);

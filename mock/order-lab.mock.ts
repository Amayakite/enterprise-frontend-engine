import { defineMock } from "./base";
import { customers, products } from "./reference-data";

export default defineMock([
  {
    url: "lab/orders",
    method: ["POST"],
    async body({ body }) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (body?.fail)
        return { code: "LAB_SAVE_ERROR", data: null, msg: "实验保存失败，数据未丢失" };
      const payload = body?.payload;
      if (
        !payload ||
        typeof payload.title !== "string" ||
        !payload.title.trim() ||
        !customers.some(
          (row) =>
            row.id === payload.customerId &&
            row.active &&
            row.organizationId === payload.organizationId
        ) ||
        !Array.isArray(payload.lines) ||
        !payload.lines.length ||
        payload.lines.some(
          (line: { productId?: unknown; quantity?: unknown; price?: unknown }) =>
            !products.some(
              (row) =>
                row.id === line.productId &&
                row.active &&
                row.organizationId === payload.organizationId
            ) ||
            typeof line.quantity !== "number" ||
            !Number.isFinite(line.quantity) ||
            line.quantity <= 0 ||
            typeof line.price !== "number" ||
            !Number.isFinite(line.price) ||
            line.price < 0
        )
      )
        return { code: "LAB_SAVE_INVALID", data: null, msg: "整单数据校验失败" };
      return {
        code: "00000",
        msg: "Mock 回执成功（不持久化）",
        data: {
          ...payload,
          id: payload.id ?? "mock-order-1",
          lines: payload.lines.map((line: { id: string | null }) => ({
            ...line,
            id: line.id ?? `mock-line-${crypto.randomUUID()}`,
          })),
        },
      };
    },
  },
]);

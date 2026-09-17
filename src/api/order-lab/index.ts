import request from "@/utils/request";
import type { OrderLabPayload, OrderLabResult } from "./types";
export const OrderLabAPI = {
  save(payload: OrderLabPayload, fail = false) {
    return request<unknown, OrderLabResult>({
      url: "/api/v1/lab/orders",
      method: "post",
      data: { payload, fail },
      errorPresentation: "local",
    });
  },
};

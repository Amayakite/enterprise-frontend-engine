import type { OrganizationId } from "@/api/reference-lab/types";

/** 开发实验合同，非正式后端协议。clientKey 不进入 DTO。 */
export interface OrderLabPayload {
  id: string | null;
  organizationId: OrganizationId;
  title: string;
  customerId: number | null;
  lines: {
    id: string | null;
    productId: string | null;
    quantity: number;
    price: number;
    note: string;
  }[];
}
export interface OrderLabResult extends OrderLabPayload {
  id: string;
}

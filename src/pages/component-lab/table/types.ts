import type { OrganizationFilters } from "@/api/reference-lab/types";
export interface OrderHeader {
  title: string;
  customerId: number | null;
}
export interface OrderLine {
  clientKey: string;
  id: string | null;
  productId: string | null;
  quantity: number;
  price: number;
  amount: number;
  note: string;
}
export interface OrderModel {
  id: string | null;
  header: OrderHeader;
  lines: OrderLine[];
}
export type OrderContext = OrganizationFilters;

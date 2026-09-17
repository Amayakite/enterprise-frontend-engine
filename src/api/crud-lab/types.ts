import type { QueryPageRequest } from "@/components/business/search/types";
import type { crudLabSchema } from "./query";
export interface CrudLabRow {
  id: number;
  code: string;
  title: string;
  billDate: string;
  amount: string;
  category: "regular" | "urgent";
  status: "draft" | "confirmed";
}
export interface CrudLabLine {
  id: string;
  name: string;
  quantity: number;
}
export interface CrudLabEntity extends CrudLabRow {
  organizationId: string;
  version: number;
  note: string;
  lines: CrudLabLine[];
}
export interface CrudLabCreate {
  title: string;
  billDate: string;
  amount: string;
  category: "regular" | "urgent";
  note: string;
  lines: CrudLabLine[];
}
export interface CrudLabUpdate extends CrudLabCreate {
  version: number;
}
export interface CrudLabReceipt {
  id: number;
  version: number;
}
export interface CrudLabScope {
  organizationId: string;
}
export interface CrudLabQuery extends QueryPageRequest<typeof crudLabSchema, CrudLabScope> {
  fail?: boolean;
  delayMs?: number;
}

import type { OrganizationId } from "@/api/reference-lab/types";
import type { QueryPageRequest } from "@/components/business/search/types";
import type { queryLabSchema } from "./query";
export interface QueryLabRecord {
  id: number;
  organizationId: OrganizationId;
  name: string;
  gender: "0" | "1" | "2";
  active: boolean;
  billDate: string;
  amount: string;
  customerId: number;
  email: string;
}
export interface QueryLabScope {
  organizationId: OrganizationId;
  customerId: number | null;
}
export interface QueryLabSearchRequest extends QueryPageRequest<
  typeof queryLabSchema,
  QueryLabScope
> {
  delayMs?: number;
  fail?: boolean;
}

import type { CrudLabCreate, CrudLabRow } from "@/api/crud-lab/types";
export interface CrudLabModel extends CrudLabCreate {
  code: string;
  status: CrudLabRow["status"];
}
export interface CrudLabControls {
  failList: boolean;
  failSave: boolean;
  failSync: boolean;
  failAfterSave: boolean;
  delay: boolean;
}

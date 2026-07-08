/**
 * Keka integration abstraction (foundation pattern): the sync engine depends
 * on KekaProvider, never on Keka's HTTP shape directly. Providers register in
 * lib/integrations/keka/index.ts; the active one is chosen by config
 * `keka.provider` (fixture for dev, http for live).
 */

export type AccessLevel = "L0" | "L1" | "L2" | "L3";

export type KekaEmployee = {
  kekaId: string;
  email: string;
  fullName: string;
  displayName: string | null;
  designation: string | null; // → users.job_title
  departmentName: string | null; // mapped to a Master code via config
  managerKekaId: string | null; // → users.reports_to
  active: boolean;
  /** Portal access level. Real Keka has no L0-L3 concept — see A-18. */
  accessLevelHint: AccessLevel | null;
};

export type KekaDepartment = {
  kekaId: string;
  name: string;
};

export interface KekaProvider {
  readonly name: string;
  fetchDepartments(): Promise<KekaDepartment[]>;
  fetchEmployees(): Promise<KekaEmployee[]>;
}

export class KekaProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KekaProviderError";
  }
}

export type SyncStats = {
  employeesCreated: number;
  employeesUpdated: number;
  employeesDeactivated: number;
  departmentsMatched: number;
  unmappedDepartments: string[];
  reportsResolved: number;
  approversResolved: number;
};

export type SyncResult = {
  runId: string;
  status: "success" | "partial" | "failed";
  provider: string;
  stats: SyncStats;
};

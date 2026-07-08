import { KEKA_FIXTURE_EMPLOYEES } from "@/lib/integrations/keka/fixture-data";
import type {
  KekaDepartment,
  KekaEmployee,
  KekaProvider,
} from "@/lib/integrations/keka/types";

/**
 * Fixture provider — returns the brief's real people (fixture-data.ts) as if
 * from Keka. The working dev source; the sync engine is fully exercised
 * against it with no Keka key.
 */
export const fixtureKekaProvider: KekaProvider = {
  name: "fixture",

  async fetchEmployees(): Promise<KekaEmployee[]> {
    return KEKA_FIXTURE_EMPLOYEES;
  },

  async fetchDepartments(): Promise<KekaDepartment[]> {
    const names = new Set(
      KEKA_FIXTURE_EMPLOYEES.map((e) => e.departmentName).filter(
        (n): n is string => Boolean(n),
      ),
    );
    return [...names].map((name) => ({ kekaId: name, name }));
  },
};

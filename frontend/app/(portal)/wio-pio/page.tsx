import { SetupNeeded } from "@/components/dashboard/SetupNeeded";
import { WioPioHub } from "@/components/wio/WioPioHub";
import { getCurrentUser } from "@/lib/auth/session";
import { getDepartments } from "@/lib/services/departments";
import { listPios } from "@/lib/services/pio";
import { listProjectOptions } from "@/lib/services/projects";
import { getWioDepartments, listWios } from "@/lib/services/wio";

export const dynamic = "force-dynamic";

/** S4 · WIO/PIO Hub — Brief §29-30 · Velocity Gate 3. */
export default async function WioPioPage() {
  const missing = [
    !process.env.DATABASE_URL && "DATABASE_URL",
    !process.env.DEV_USER_ID && "DEV_USER_ID",
  ].filter((v): v is string => typeof v === "string");

  if (missing.length > 0) {
    return (
      <div>
        <PageTitle />
        <SetupNeeded missing={missing} />
      </div>
    );
  }

  const user = await getCurrentUser();
  const [wios, pios, projects, wioDepartments, departments] = await Promise.all([
    listWios(user),
    listPios(user),
    listProjectOptions(user),
    getWioDepartments(),
    getDepartments(),
  ]);
  const departmentNames = Object.fromEntries(
    departments.map((d) => [d.code, d.name]),
  );

  return (
    <div>
      <div className="mb-6">
        <PageTitle />
      </div>
      <WioPioHub
        initialWios={wios}
        initialPios={pios}
        projects={projects}
        wioDepartments={wioDepartments}
        departmentNames={departmentNames}
      />
    </div>
  );
}

function PageTitle() {
  return (
    <div>
      <h1 className="mb-1 font-heading text-4xl text-white">WIO / PIO Hub</h1>
      <p className="font-body text-sm font-light text-label">
        S4 · Phase 1 · Universal work initiation, 15-day clock — Brief §29–30 ·
        Velocity Gate 3
      </p>
    </div>
  );
}

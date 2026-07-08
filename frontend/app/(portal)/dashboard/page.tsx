import Link from "next/link";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PrioritySignalBand } from "@/components/dashboard/PrioritySignalBand";
import { ProjectRiskTable } from "@/components/dashboard/ProjectRiskTable";
import { SetupNeeded } from "@/components/dashboard/SetupNeeded";
import { WioClockTable } from "@/components/dashboard/WioClockTable";
import { getCurrentUser } from "@/lib/auth/session";
import { formatINR } from "@/lib/format";
import { getCrmtlDashboard } from "@/lib/services/dashboard";

export const dynamic = "force-dynamic";

/** S2 · Blueprint §04 wireframe: signal first, metrics second, detail third. */
export default async function DashboardPage() {
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
  const data = await getCrmtlDashboard(user);
  const { metrics } = data;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageTitle />
        <Link
          href="/wio-pio"
          className="shrink-0 rounded bg-espresso px-5 py-2.5 font-body text-sm font-bold text-cream transition-opacity hover:opacity-90"
        >
          + New WIO
        </Link>
      </div>

      <div className="mb-8">
        <PrioritySignalBand signals={data.prioritySignals} />
      </div>

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Active projects"
          value={String(metrics.activeProjects)}
        />
        <MetricCard label="WIOs open" value={String(metrics.openWios)} />
        <MetricCard
          label="AR outstanding"
          value={formatINR(metrics.arOutstanding)}
        />
        <MetricCard
          label="Weekly Pulse"
          value={`${metrics.pulsesSent}/${metrics.pulsesDue}`}
          sub="sent this week"
        />
      </div>

      <section className="mb-10">
        <h2 className="mb-3 font-heading text-2xl text-espresso">
          WIO conversion clock
        </h2>
        <WioClockTable rows={data.wioClock} />
      </section>

      <section id="projects">
        <h2 className="mb-3 font-heading text-2xl text-espresso">
          Active projects by risk
        </h2>
        <ProjectRiskTable rows={data.projectsByRisk} />
      </section>
    </div>
  );
}

function PageTitle() {
  return (
    <div>
      <h1 className="mb-1 font-heading text-4xl text-espresso">
        CRM TL Dashboard
      </h1>
      <p className="font-body text-sm font-light text-label">
        S2 · Phase 1 · Signal first, metrics second, detail third — Brief §39
      </p>
    </div>
  );
}

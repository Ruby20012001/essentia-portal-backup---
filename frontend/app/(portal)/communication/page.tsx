import { MetricCard } from "@/components/dashboard/MetricCard";
import { WeeklyPulseBoard } from "@/components/communication/WeeklyPulseBoard";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { listWeeklyPulses, pulseCounts } from "@/lib/services/weekly-pulse";

export const dynamic = "force-dynamic";

/**
 * S17 · Communication Spine — Weekly Pulse board (Brief §26/§36; Velocity Gate #2).
 * This week's pulse status for every active project. Gated to read:communication_spine
 * (L0/L1/L2); RLS scopes an L2 TL to their own projects, founders see all.
 */
export default async function CommunicationSpinePage() {
  const user = await getCurrentUser();
  const decision = await can(user, "read", "communication_spine");

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">Communication Spine</h1>
        <p className="font-body text-sm font-light text-muted">
          Weekly Pulse — the Friday update for every active project, auto-drafted at 05:00, reviewed and sent by the CRM TL.
        </p>
      </div>

      {!decision.allowed ? (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Not available</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            The Communication Spine is available to the CRM team leads and leadership.
          </p>
        </div>
      ) : (
        <Board user={user} />
      )}
    </div>
  );
}

async function Board({ user }: { user: { id: string; accessLevel: "L0" | "L1" | "L2" | "L3" } }) {
  const rows = await listWeeklyPulses(user);
  const counts = pulseCounts(rows);

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Active projects" value={String(counts.active)} />
        <MetricCard label="Pulses sent" value={String(counts.sent)} sub="this week" />
        <MetricCard label="Drafted" value={String(counts.drafted)} sub="awaiting send" />
        <MetricCard label="Missing" value={String(counts.missing)} sub="no draft yet" />
      </div>

      <section>
        <h2 className="mb-3 font-heading text-2xl text-white">This week&rsquo;s Pulse</h2>
        <WeeklyPulseBoard rows={rows} />
      </section>
    </>
  );
}

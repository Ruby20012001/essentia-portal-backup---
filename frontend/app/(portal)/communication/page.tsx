import { MetricCard } from "@/components/dashboard/MetricCard";
import { WeeklyPulseBoard } from "@/components/communication/WeeklyPulseBoard";
import { WelcomeLetterBoard } from "@/components/communication/WelcomeLetterBoard";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { getConfig } from "@/lib/services/config";
import { listWeeklyPulses, pulseCounts } from "@/lib/services/weekly-pulse";
import { listWelcomeLetters, welcomeCounts } from "@/lib/services/welcome-letter";

export const dynamic = "force-dynamic";

/**
 * S17 · Communication Spine (Brief §26/§28/§36).
 * Two gates live here: the Welcome Letter within 4 hrs of the first instalment,
 * with the mandatory read-to-the-end gate before send (Velocity Gate #8), and
 * the Friday Weekly Pulse (Velocity Gate #2). Gated to read:communication_spine
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
          Every letter a family receives — drafted by the portal, read to the end by the TL, then sent.
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
  const [rows, letters, slaHours] = await Promise.all([
    listWeeklyPulses(user),
    listWelcomeLetters(user),
    getConfig<number>("comms.welcome_letter_sla_hours", 4),
  ]);
  const counts = pulseCounts(rows);
  const wc = welcomeCounts(letters);

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Welcome Letters" value={String(wc.total)} sub={`${wc.sent} sent`} />
        <MetricCard
          label="Awaiting the TL"
          value={String(wc.awaitingRead + wc.awaitingSend)}
          sub={wc.awaitingRead > 0 ? `${wc.awaitingRead} not yet read` : "all read"}
        />
        <MetricCard label="Pulses sent" value={String(counts.sent)} sub="this week" />
        <MetricCard label="Missing pulses" value={String(counts.missing)} sub="no draft yet" />
      </div>

      <section className="mb-10">
        <h2 className="mb-1 font-heading text-2xl text-white">Welcome Letters</h2>
        <p className="mb-3 font-body text-xs font-light text-muted">
          Drafted within {slaHours} hours of a first instalment (Velocity Gate 8). The send button opens only after
          the letter has been read to the end.
        </p>
        <WelcomeLetterBoard letters={letters} slaHours={slaHours} />
      </section>

      <section>
        <h2 className="mb-1 font-heading text-2xl text-white">This week&rsquo;s Pulse</h2>
        <p className="mb-3 font-body text-xs font-light text-muted">
          The Friday update for every active project, auto-drafted at 05:00 (Velocity Gate 2).
        </p>
        <WeeklyPulseBoard rows={rows} />
      </section>
    </>
  );
}

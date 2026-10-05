import Link from "next/link";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { CapacityChart, PioQueue } from "@/components/factory/FactoryFloor";
import { getCurrentUser } from "@/lib/auth/session";
import { getFactoryFloor } from "@/lib/services/factory-floor";
import {
  assignmentState,
  breachRuns,
  daysLeft,
  forecastDays,
  sortQueue,
} from "@/lib/services/factory-floor-logic";
import { can } from "@/lib/services/permissions";

export const dynamic = "force-dynamic";

/**
 * S10 · Production Facility — NH8 (Brief §30). A station HOD's queue on the
 * 45-day clock and the 14-day capacity forecast, so a crunch is seen days
 * before it lands. Leadership can look at any station, or all of them.
 * Read-only for now.
 */
export default async function FactoryPage({
  searchParams,
}: {
  searchParams: { station?: string };
}) {
  const user = await getCurrentUser();
  const decision = await can(user, "read", "factory");
  const leadership = decision.allowed && decision.scope === "all";
  const floor = decision.allowed
    ? await getFactoryFloor(user, leadership, searchParams.station ?? null)
    : null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">Production Facility — NH8</h1>
        <p className="font-body text-sm font-light text-muted">
          {floor?.selected ? `${floor.selected.name} · ` : ""}PIOs on the 45-day clock and the next
          14 days of capacity.
        </p>
      </div>

      {!floor || floor.stations.length === 0 ? (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Station view</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            This screen opens for leadership and for the HOD of a production station.
          </p>
        </div>
      ) : (
        <Floor floor={floor} leadership={leadership} />
      )}
    </div>
  );
}

function Floor({
  floor,
  leadership,
}: {
  floor: NonNullable<Awaited<ReturnType<typeof getFactoryFloor>>>;
  leadership: boolean;
}) {
  const { today } = floor;
  const queue = sortQueue(floor.queue, today);
  const days = forecastDays(floor.forecast, today);
  const runs = breachRuns(days);
  const inProduction = queue.filter((a) => assignmentState(a, today) === "In production").length;
  const queued = queue.filter((a) => assignmentState(a, today) === "Queued").length;
  const overdue = queue.filter((a) => assignmentState(a, today) === "Overdue");
  const forecastMissing = days.filter((d) => !d.forecast).length;
  const worst = days.filter((d) => d.breach).sort((a, b) => b.arriving - (b.capacity ?? 0) - (a.arriving - (a.capacity ?? 0)))[0];

  return (
    <>
      {floor.stations.length > 1 ? (
        <nav aria-label="Stations" className="mb-6 flex flex-wrap gap-2">
          {leadership ? <StationLink href="/factory" label="All stations" on={!floor.selected} /> : null}
          {floor.stations.map((s) => (
            <StationLink
              key={s.id}
              href={`/factory?station=${encodeURIComponent(s.code)}`}
              label={s.name}
              on={floor.selected?.id === s.id}
            />
          ))}
        </nav>
      ) : null}

      {runs.length > 0 ? (
        <div role="status" className="mb-6 rounded-lg border border-error/40 bg-error/10 px-5 py-3 font-body text-sm text-white">
          <span className="font-bold text-error">Capacity breach · {runs.join(", ")}.</span>{" "}
          {worst
            ? `${worst.arriving} PIOs arrive on ${worst.date === today ? "today" : `day ${worst.n}`} against capacity for ${worst.capacity}. Request additional craftspeople or reschedule a PIO before then.`
            : null}
        </div>
      ) : null}

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="PIOs active" value={String(queue.length)} sub={`${inProduction} in production · ${queued} queued`} />
        <MetricCard
          label="Capacity risk"
          value={runs.length ? runs.join(", ") : "None"}
          sub="in the next 14 days"
        />
        <MetricCard
          label="Overdue"
          value={String(overdue.length)}
          sub={
            overdue[0]
              ? `${overdue[0].project ?? overdue[0].pioNumber} · ${-daysLeft(overdue[0].target, today)} days late`
              : "Every PIO inside its clock"
          }
        />
        <MetricCard
          label="Forecast entered"
          value={`${days.length - forecastMissing} of ${days.length} days`}
          sub={forecastMissing ? "Blank days cannot show a breach" : "Full two weeks covered"}
        />
      </div>

      <section className="mb-10">
        <h2 className="mb-3 font-heading text-2xl text-white">14-day capacity forecast</h2>
        <CapacityChart days={days} />
      </section>

      <section>
        <h2 className="mb-3 font-heading text-2xl text-white">PIO queue · 45-day clocks</h2>
        <PioQueue rows={queue} today={today} showStation={!floor.selected} />
      </section>
    </>
  );
}

function StationLink({ href, label, on }: { href: string; label: string; on: boolean }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`rounded-full border px-3 py-1 font-body text-xs ${
        on ? "border-brand bg-brand/10 text-white" : "border-line text-secondary hover:bg-hover"
      }`}
    >
      {label}
    </Link>
  );
}

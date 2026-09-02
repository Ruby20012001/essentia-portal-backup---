import { MetricCard } from "@/components/dashboard/MetricCard";
import { ExitProtocolBoard } from "@/components/people/ExitProtocolBoard";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { listExits } from "@/lib/services/exit-protocol";
import { listSuccessionPacks } from "@/lib/services/succession-pack";

export const dynamic = "force-dynamic";

/**
 * S12 · Exit Protocol (Brief §36 · Velocity Gate #4). Every exit and
 * the confirmed status of all six removal actions that fire at 11:59pm on the
 * exit date. Gated to hr_access on users — people data is HR / L0-L1 only (§36).
 */
export default async function ExitProtocolPage() {
  const user = await getCurrentUser();
  const decision = await can(user, "hr_access", "users");

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">Exit Protocol</h1>
        <p className="font-body text-sm font-light text-muted">
          Six removal actions, fired simultaneously at 11:59pm on the exit date — with a confirmed log of
          what actually happened.
        </p>
      </div>

      {!decision.allowed ? (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Restricted</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            Exit and people data is available to HR and the founders only.
          </p>
        </div>
      ) : (
        <Board />
      )}
    </div>
  );
}

async function Board() {
  const [exits, packs] = await Promise.all([listExits(), listSuccessionPacks()]);
  const fired = exits.filter((e) => e.fired).length;
  const notWired = exits
    .filter((e) => e.fired)
    .reduce((n, e) => n + e.actions.filter((a) => a.status === "not_wired" || a.status === "failed").length, 0);
  const packed = exits.filter((e) => packs.has(e.userId)).length;

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Exits on record" value={String(exits.length)} />
        <MetricCard label="Protocol fired" value={String(fired)} sub="11:59pm removals" />
        <MetricCard label="Succession packs" value={`${packed}/${exits.length}`} sub="generated" />
        <MetricCard label="Removals not done" value={String(notWired)} sub="need an integration" />
      </div>

      <section>
        <h2 className="mb-3 font-heading text-2xl text-white">Exits</h2>
        <ExitProtocolBoard exits={exits} packs={packs} />
      </section>
    </>
  );
}

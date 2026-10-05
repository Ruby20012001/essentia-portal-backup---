import { MetricCard } from "@/components/dashboard/MetricCard";
import { getCurrentUser } from "@/lib/auth/session";
import { getApiHealth } from "@/lib/services/api-health";
import {
  buildRows,
  PULSE_MINUTES,
  STALE_AFTER_MINUTES,
  summarise,
  type HealthState,
  type IntegrationRow,
  type Wiring,
} from "@/lib/services/api-health-logic";
import { can } from "@/lib/services/permissions";

export const dynamic = "force-dynamic";

/**
 * S13 · API Health (Blueprint §09) — the eleven integrations, their latest
 * logged check, and how far each is built on the portal's side. Read-only.
 * The 'api-health-pulse' job (db/061) writes the checks; only reachable
 * integrations are probed, and the rest say "Never checked", not green.
 */
export default async function ApiHealthPage() {
  const user = await getCurrentUser();
  const decision = await can(user, "read", "api_health");

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">API Health</h1>
        <p className="font-body text-sm font-light text-muted">
          11 integrations · meant to be checked every {PULSE_MINUTES} minutes · times in IST
        </p>
      </div>
      {decision.allowed ? (
        <Health user={user} />
      ) : (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Systems view</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            Integration health is open to leadership and the systems team.
          </p>
        </div>
      )}
    </div>
  );
}

async function Health({ user }: { user: Awaited<ReturnType<typeof getCurrentUser>> }) {
  const now = new Date();
  const data = await getApiHealth(user);
  const rows = buildRows(data.checks, data.failures, data.wiring, now);
  const s = summarise(rows, data.today);
  const neverChecked = rows.every((r) => r.state === "Never checked");

  return (
    <>
      {neverChecked ? (
        <div role="status" className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-5 py-3 font-body text-sm text-white">
          <span className="font-bold text-warning">No integration has a recorded check yet.</span> The{" "}
          {PULSE_MINUTES}-minute check only tests integrations the portal can actually reach. Today that is
          Anthropic, once its key is set, and only after the scheduler has run. Treat every row below as unknown,
          not as healthy.
        </div>
      ) : null}
      {s.problems.map((p) => (
        <div key={p.key} role="status" className="mb-3 rounded-lg border border-error/40 bg-error/10 px-5 py-3 font-body text-sm text-white">
          <span className="font-bold text-error">
            {p.label} {p.state.toLowerCase()}
            {p.failures ? ` · ${p.failures} failures in a row` : ""}.
          </span>{" "}
          {p.powers} may be showing its last confirmed data.
          {p.error ? <span className="text-muted"> Last error: {p.error}</span> : null}
        </div>
      ))}

      <div className="mb-10 mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Healthy" value={`${s.healthy}/${s.total}`} sub={s.unmonitored ? `${s.unmonitored} not checked recently` : "All checked"} />
        <MetricCard
          label="Degraded or down"
          value={String(s.problems.length)}
          sub={s.problems.length ? s.problems.map((p) => p.label).join(", ") : "None"}
        />
        <MetricCard label="Avg response" value={s.avgMs !== null ? `${s.avgMs} ms` : "—"} sub="Healthy integrations" />
        <MetricCard label="Uptime today" value={s.uptimePct !== null ? `${s.uptimePct}%` : "—"} sub={`${data.today.total} checks`} />
      </div>

      <HealthTable rows={rows} />
      <p className="mt-3 font-body text-xs font-light text-muted">
        A result older than {STALE_AFTER_MINUTES} minutes is shown as stale, whatever it said.
      </p>
    </>
  );
}

const STATE_TONE: Record<HealthState, string> = {
  Healthy: "bg-success/10 text-success",
  Degraded: "bg-warning/10 text-warning",
  Down: "bg-error/10 text-error",
  Stale: "bg-warning/10 text-warning",
  "Never checked": "bg-white/5 text-muted",
};

const WIRING_TONE: Record<Wiring, string> = {
  Live: "text-success",
  "Test data": "text-warning",
  "Not configured": "text-warning",
  "Not built": "text-muted",
};

function HealthTable({ rows }: { rows: IntegrationRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left font-body text-[13.5px]">
        <thead>
          <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
            <th className="px-4 py-2.5 font-bold">Integration</th>
            <th className="px-4 py-2.5 font-bold">Portal side</th>
            <th className="px-4 py-2.5 font-bold">Health</th>
            <th className="px-4 py-2.5 text-right font-bold">Response</th>
            <th className="px-4 py-2.5 font-bold">Last checked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line bg-card transition-colors hover:bg-hover">
              <td className="px-4 py-2.5">
                <span className="block font-bold text-white">{r.label}</span>
                <span className="block text-xs font-light text-muted">{r.powers}</span>
              </td>
              <td className={`px-4 py-2.5 font-light ${WIRING_TONE[r.wiring]}`}>{r.wiring}</td>
              <td className="px-4 py-2.5">
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATE_TONE[r.state]}`}>
                  {r.state}
                  {r.failures && r.state !== "Healthy" ? ` · ${r.failures}` : ""}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right font-light tabular-nums text-white">
                {r.responseMs !== null ? `${r.responseMs} ms` : "—"}
              </td>
              <td className="px-4 py-2.5 font-light text-secondary">{r.checkedAt ? ist(r.checkedAt) : "Never"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ist(ts: string): string {
  return new Date(ts).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

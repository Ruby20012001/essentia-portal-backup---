import Link from "next/link";
import { itemSlaRisk, type ApprovalOverviewItem } from "@/lib/services/workflow-oversight";
import type { SlaRisk } from "@/lib/services/workflow-advisory";

/**
 * Workflow Dashboard (Phase 4 frontend, screen 1) — every workflow in flight,
 * as cards: what it is, which document, where it is stuck, who owes the
 * decision, and its SLA position. Read-only; acting happens on My Approvals.
 *
 * Reuses the portal design system only (card / surface / line tokens, the
 * existing pill shape and Lato scale) — no new visual language.
 */

export function WorkflowDashboard({
  running,
  now,
}: {
  running: ApprovalOverviewItem[];
  now: Date;
}) {
  if (running.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-card px-8 py-16 text-center">
        <p className="font-heading text-2xl text-white">Nothing in flight</p>
        <p className="mt-1 font-body text-sm font-light text-muted">
          No workflow is currently awaiting a decision.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {running.map((w) => (
        <WorkflowCard key={w.instanceId} item={w} risk={itemSlaRisk(w, now)} now={now} />
      ))}
    </ul>
  );
}

function WorkflowCard({
  item,
  risk,
  now,
}: {
  item: ApprovalOverviewItem;
  risk: SlaRisk;
  now: Date;
}) {
  const sla = slaLabel(risk);
  return (
    <li className="flex min-w-0 flex-col rounded-lg border border-line bg-card p-5 transition-colors hover:bg-hover">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 break-words font-body text-[15px] font-bold text-white">
          {item.workflowName}
        </h3>
        <Pill className="bg-warning/10 text-warning">Running</Pill>
      </div>

      <p className="mt-1 break-words font-body text-sm font-light text-secondary">
        {item.resourceRef ?? "—"}
      </p>

      <dl className="mt-4 space-y-2 font-body text-xs">
        <Row label="Stage">
          <span className="text-secondary">{item.groupName}</span>
          {item.quorum > 1 ? (
            <span className="text-muted"> · {item.pendingCount} awaiting</span>
          ) : null}
        </Row>
        <Row label="Waiting on">
          <span className="break-words text-secondary">{item.waitingOn ?? "—"}</span>
        </Row>
        <Row label="Started">
          <span className="text-secondary">
            {item.startedAt.slice(0, 10)} · {ageLabel(item.startedAt, now)} ago
          </span>
          {item.startedBy ? <span className="text-muted"> · by {item.startedBy}</span> : null}
        </Row>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className={`font-body text-xs ${sla.tone}`}>{sla.text}</span>
        <Link
          href={`/workflows/${item.instanceId}`}
          className="shrink-0 rounded border border-line-strong px-3 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-hover"
        >
          Open
        </Link>
      </div>
    </li>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

/** SLA indicator, reusing the deterministic risk model (no new logic). */
function slaLabel(risk: SlaRisk): { text: string; tone: string } {
  if (risk.level === "none") return { text: "No SLA", tone: "text-muted" };
  if (risk.level === "breached") return { text: "SLA breached", tone: "font-bold text-error" };
  const h = Math.round(risk.hoursRemaining ?? 0);
  if (risk.level === "high") return { text: `Due in ${h}h`, tone: "text-error" };
  if (risk.level === "medium") return { text: `Due in ${h}h`, tone: "text-warning" };
  return { text: `Due in ${h}h`, tone: "text-success" };
}

function ageLabel(startedAt: string, now: Date): string {
  const ms = now.getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h`;
  return `${Math.floor(ms / 60_000)}m`;
}

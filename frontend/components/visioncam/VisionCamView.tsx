import type { VisionCam } from "@/lib/services/visioncam";
import { inr } from "@/components/projects/format";

/**
 * VisionCAM web view (S3) — the site-photo log + the billing gate. Read-only
 * monitor; capture is the offline-first mobile app. Server-rendered.
 */

const QC: Record<string, { cls: string; label: string }> = {
  pass: { cls: "bg-success/10 text-success", label: "QC pass" },
  pending: { cls: "bg-warning/10 text-warning", label: "QC pending" },
  fail: { cls: "bg-error/10 text-error", label: "QC fail" },
  query: { cls: "bg-warning/10 text-warning", label: "QC query" },
};

function fmtTime(iso: string): string {
  return iso ? iso.replace("T", " ").slice(0, 16) : "—";
}

export function VisionCamView({ vc, canSeeFinancials }: { vc: VisionCam; canSeeFinancials: boolean }) {
  const s = vc.summary;
  return (
    <div>
      {/* Billing gate (Velocity Gate 1) */}
      {canSeeFinancials && vc.billingGate.length > 0 ? (
        <div className="mb-6 space-y-2">
          {vc.billingGate.map((g, i) => (
            <div key={i} role="alert" className="rounded-lg border-l-4 border-error bg-error/5 px-5 py-3">
              <p className="font-body text-sm font-bold text-error">
                {g.name} — {inr(g.amount)} billing blocked
                {g.overdueDays && g.overdueDays > 0 ? ` · ${g.overdueDays}d overdue` : ""}
              </p>
              <p className="mt-0.5 font-body text-xs font-light text-secondary">
                Awaiting a QC-passed VisionCAM photo — capture on site to release billing to Accounts.
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Photos today" value={String(s.today)} sub={`${s.total} total`} />
        <Card label="QC pass" value={String(s.qcPass)} tone="text-success" />
        <Card label="QC pending" value={String(s.qcPending)} tone={s.qcPending > 0 ? "text-warning" : "text-white"} />
        {canSeeFinancials ? (
          <Card label="Billing blocked" value={inr(s.blockedAmount)} tone={s.blockedAmount > 0 ? "text-error" : "text-white"} />
        ) : (
          <Card label="QC fail" value={String(s.qcFail)} tone={s.qcFail > 0 ? "text-error" : "text-white"} />
        )}
      </div>

      {/* Recent captures */}
      <h2 className="mb-1 font-body text-sm font-bold text-white">Recent captures</h2>
      <p className="mb-3 font-body text-xs font-light text-muted">
        Capture runs on the VisionCAM mobile app (offline-first, GFC overlay); this is the synced site log.
      </p>

      {vc.photos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-card px-5 py-12 text-center font-body text-sm font-light text-muted">
          No site photos captured for this project yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vc.photos.map((p) => {
            const qc = QC[p.qcStatus] ?? { cls: "bg-white/5 text-muted", label: p.qcStatus };
            return (
              <li key={p.id} className="overflow-hidden rounded-lg border border-line bg-card">
                <div className="flex h-28 flex-col items-center justify-center gap-1.5 border-b border-line bg-canvas text-muted">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span className="font-body text-[10px] tracking-wide">{p.gfcRef ?? "site photo"}</span>
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-body text-xs text-secondary">{fmtTime(p.capturedAt)}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${qc.cls}`}>
                      {qc.label}
                    </span>
                  </div>
                  <p className="mt-1 font-body text-xs font-light text-muted">
                    {p.designStageNo != null ? `Stage ${p.designStageNo} · ` : ""}
                    {p.capturedBy ?? "—"}
                    {p.billingTriggered ? <span className="text-success"> · billing released</span> : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <p className="font-body text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-1 font-heading text-2xl ${tone ?? "text-white"}`}>{value}</p>
      {sub ? <p className="mt-0.5 font-body text-xs font-light text-muted">{sub}</p> : null}
    </div>
  );
}

import type { ProjectDetail } from "@/lib/services/project-hub";
import { inr, phaseLabel, ragBadgeClass, RAG_META } from "@/components/projects/format";

/**
 * Project Hub — one project's central record (read-only). Surfaces the existing
 * project spine: identity, team, financials (fenced), phase timeline, billing,
 * and linked WIO/PIO documents. No client interactivity; server-rendered.
 */

const BILLING_STATE: Record<ProjectDetail["billing"][number]["state"], { cls: string; label: string }> = {
  paid: { cls: "bg-success/10 text-success", label: "Paid" },
  part_paid: { cls: "bg-success/10 text-success", label: "Part-paid" },
  overdue: { cls: "bg-error/10 text-error", label: "Overdue" },
  due: { cls: "bg-warning/10 text-warning", label: "Due" },
  upcoming: { cls: "bg-white/5 text-muted", label: "Upcoming" },
};

export function ProjectDetailView({
  detail,
  canSeeFinancials,
}: {
  detail: ProjectDetail;
  canSeeFinancials: boolean;
}) {
  const d = detail;
  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-2xl text-white">{d.projectCode}</h2>
              <span className={ragBadgeClass(d.ragStatus)}>{RAG_META[d.ragStatus].label}</span>
              {d.isDubai ? (
                <span className="rounded-full bg-white/5 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide text-secondary">
                  Dubai
                </span>
              ) : null}
            </div>
            <p className="mt-1 font-body text-sm text-secondary">{d.projectName ?? "—"}</p>
            <p className="mt-0.5 font-body text-xs font-light text-muted">
              {[d.siteAddress, d.city].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="font-body text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Current phase</p>
            <p className="mt-0.5 font-body text-sm font-bold text-white">{phaseLabel(d.currentPhase)}</p>
          </div>
        </div>
        {d.ragNotes ? (
          <p className="mt-3 rounded border-l-2 border-line-strong bg-canvas px-3 py-2 font-body text-xs font-light text-secondary">
            {d.ragNotes}
          </p>
        ) : null}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Field label="Type" value={d.projectType ? phaseLabel(d.projectType) : "—"} />
          <Field label="Area" value={d.totalAreaSqft != null ? `${d.totalAreaSqft.toLocaleString("en-IN")} sqft` : "—"} />
          <Field label="Target DoR" value={d.targetDorDate ?? "—"} />
          <Field label="Actual DoR" value={d.actualDorDate ?? "—"} />
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Client / family */}
        <section className="rounded-lg border border-line bg-card p-5">
          <H>Client</H>
          <p className="mt-1 font-body text-lg text-white">{d.familyName ?? "—"}</p>
          {d.familyCode ? <p className="font-body text-xs font-light text-muted">{d.familyCode}</p> : null}
          {d.profileCompletePct != null ? (
            <div className="mt-4">
              <div className="flex items-center justify-between font-body text-xs">
                <span className="text-muted">Family Profile</span>
                <span className="text-secondary">{d.profileCompletePct}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full ${d.profileCompletePct >= 80 ? "bg-success" : d.profileCompletePct >= 40 ? "bg-warning" : "bg-error"}`}
                  style={{ width: `${d.profileCompletePct}%` }}
                />
              </div>
            </div>
          ) : null}
        </section>

        {/* Team */}
        <section className="rounded-lg border border-line bg-card p-5 lg:col-span-2">
          <H>Team</H>
          {d.team.length === 0 ? (
            <Muted>No team assigned yet.</Muted>
          ) : (
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {d.team.map((m) => (
                <Field key={m.role} label={m.role} value={m.name ?? "—"} />
              ))}
            </dl>
          )}
        </section>
      </div>

      {/* Financials (fenced) */}
      {canSeeFinancials ? (
        <section className="rounded-lg border border-line bg-card p-5">
          <H>Commercials</H>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Field label="Project value" value={inr(d.projectValueEst)} />
            <Field label="Design fee" value={inr(d.designFeeTotal)} />
            <Field label="PMC fee" value={inr(d.pmcFeeTotal)} />
            <Field label="AR outstanding" value={inr(d.arOutstanding)} tone={d.arOutstanding && d.arOutstanding > 0 ? "text-warning" : undefined} />
          </dl>

          <h4 className="mb-2 mt-5 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            Billing milestones <span className="text-secondary">({d.billing.length})</span>
          </h4>
          {d.billing.length === 0 ? (
            <Muted>No billing milestones recorded.</Muted>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[560px] text-left font-body text-[13px]">
                <thead>
                  <tr className="bg-surface text-[10px] uppercase tracking-[0.12em] text-secondary">
                    <th className="px-3 py-2 font-bold">#</th>
                    <th className="px-3 py-2 font-bold">Milestone</th>
                    <th className="px-3 py-2 font-bold">Amount</th>
                    <th className="px-3 py-2 font-bold">Paid</th>
                    <th className="px-3 py-2 font-bold">Status</th>
                    <th className="px-3 py-2 font-bold">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {d.billing.map((b, i) => (
                    <tr key={i} className="border-t border-line bg-card">
                      <td className="px-3 py-2 text-muted">{b.sequenceNo ?? i + 1}</td>
                      <td className="px-3 py-2 text-secondary">{b.name}</td>
                      <td className="px-3 py-2 text-secondary">{inr(b.amount)}</td>
                      <td className="px-3 py-2 text-secondary">{inr(b.amountPaid)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${BILLING_STATE[b.state].cls}`}>
                          {BILLING_STATE[b.state].label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted">{b.invoiceNumber ?? (b.dueDate ? `due ${b.dueDate}` : "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-lg border border-line bg-card px-5 py-4">
          <H>Commercials</H>
          <Muted>Financials and billing are restricted to Accounts and leadership.</Muted>
        </section>
      )}

      {/* Phase timeline */}
      <section className="rounded-lg border border-line bg-card p-5">
        <H>Activity phases</H>
        {d.phases.length === 0 ? (
          <Muted>No phase plan recorded yet.</Muted>
        ) : (
          <ul className="mt-3 space-y-2">
            {d.phases.map((ph) => {
              const isCurrent = ph.phase === d.currentPhase;
              return (
                <li key={ph.phase} className={`rounded-lg border px-3 py-2.5 ${isCurrent ? "border-line-strong bg-hover" : "border-line bg-canvas"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className={`font-body text-sm ${isCurrent ? "font-bold text-white" : "text-secondary"}`}>
                      {phaseLabel(ph.phase)}
                      {isCurrent ? <span className="ml-2 font-body text-[10px] font-bold uppercase tracking-wide text-secondary">current</span> : null}
                    </span>
                    <span className="shrink-0 font-body text-xs text-muted">{ph.completionPct}%</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/5">
                    <div className="h-full bg-secondary" style={{ width: `${ph.completionPct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Linked documents */}
      <section className="rounded-lg border border-line bg-card p-5">
        <H>Documents &amp; orders</H>
        {d.documents.length === 0 ? (
          <Muted>No WIOs or PIOs raised on this project yet.</Muted>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {d.documents.map((doc, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas px-3 py-2">
                <span className="min-w-0">
                  <span className="font-body text-[10px] font-bold uppercase tracking-wide text-muted">{doc.kind}</span>
                  <span className="ml-2 font-body text-sm font-bold text-white">{doc.ref}</span>
                  {doc.extra ? <span className="ml-2 font-body text-xs text-muted">{doc.extra}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {doc.rag ? <span className={ragBadgeClass(doc.rag)}>{RAG_META[doc.rag].label}</span> : null}
                  <span className="font-body text-xs font-light text-secondary">{phaseLabel(doc.status)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="font-body text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{children}</h3>;
}
function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="font-body text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className={`mt-0.5 break-words font-body text-sm font-light ${tone ?? "text-white"}`}>{value}</dd>
    </div>
  );
}
function Muted({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 font-body text-sm font-light text-muted">{children}</p>;
}

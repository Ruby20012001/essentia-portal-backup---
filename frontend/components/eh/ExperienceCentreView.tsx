import type { ExperienceCentre, DiscountRow } from "@/lib/services/eh";
import { inr } from "@/components/projects/format";
import { ApproveDiscountButton } from "@/components/eh/ApproveDiscountButton";

/**
 * S6 · essentia home — Experience Centre (Brief §28 · Velocity Gate 5).
 * Server-rendered. The discount gate leads the screen because it is the gate:
 * a Client Advisor may not communicate a discount until the Country Head has
 * approved it, and any breach is named rather than smoothed over (ADR-HS-01).
 */
export function ExperienceCentreView({
  ec,
  canApprove,
  canSeeFinancials,
  isLeadership = false,
}: {
  ec: ExperienceCentre;
  canApprove: boolean;
  canSeeFinancials: boolean;
  /** Leadership owns the assignment of Country Heads, so only they see §Gate-5 gaps. */
  isLeadership?: boolean;
}) {
  const s = ec.summary;
  const breaches = [...ec.pending, ...ec.settled].filter((r) => r.communicatedBeforeApproval);

  return (
    <div>
      {/* Velocity Gate 5 is open wherever a centre has no Country Head. */}
      {isLeadership && ec.unguarded.length > 0 ? (
        <div role="alert" className="mb-6 rounded-lg border-l-4 border-error bg-error/5 px-5 py-3">
          <p className="font-body text-sm font-bold text-error">
            Velocity Gate 5 is open:{" "}
            {ec.unguarded.map((u) => u.name).join(", ")}{" "}
            {ec.unguarded.length === 1 ? "has" : "have"} no Country Head assigned.
          </p>
          <p className="mt-0.5 font-body text-xs font-light text-secondary">
            The discount gate cannot be worked there —{" "}
            {ec.unguarded.reduce((n, u) => n + u.awaiting, 0)} discount
            {ec.unguarded.reduce((n, u) => n + u.awaiting, 0) === 1 ? "" : "s"} awaiting approval with
            nobody able to give it. Assign a head to close the gate.
          </p>
        </div>
      ) : null}
      {/* The violation banner — named advisors, exact discounts. */}
      {breaches.length > 0 ? (
        <div role="alert" className="mb-6 rounded-lg border-l-4 border-error bg-error/5 px-5 py-3">
          <p className="font-body text-sm font-bold text-error">
            Discount gate violation:{" "}
            {breaches
              .map((b) => `${b.advisor ?? "Unknown advisor"} (${b.discountPct}%)`)
              .join(" and ")}{" "}
            communicated {breaches.length === 1 ? "a discount" : "discounts"} before your approval.
          </p>
          <p className="mt-0.5 font-body text-xs font-light text-secondary">
            {(() => {
              const open = breaches.filter((b) => !b.approvedAt).length;
              const logged = `${breaches.length === 1 ? "It is" : "All are"} logged`;
              if (open === 0) return `${logged}. Every one is now signed off — the breach stays on record.`;
              if (open === breaches.length) {
                return `${logged} and ${open === 1 ? "still awaits" : "still await"} your sign-off.`;
              }
              return `${logged}. ${open} still ${open === 1 ? "awaits" : "await"} your sign-off; the rest are signed off and the breach stays on record.`;
            })()}
          </p>
        </div>
      ) : null}

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {canSeeFinancials ? (
          <Card
            label="MTD revenue"
            value={inr(s.monthToDate)}
            sub={`of ${inr(s.target)} target · ${s.pctOfTarget}%`}
          />
        ) : (
          <Card label="Transactions MTD" value={String(ec.pending.length + ec.settled.length)} />
        )}
        {canSeeFinancials ? (
          <Card
            label="Today's sales"
            value={inr(s.todaySales)}
            sub={`${s.todayTransactions} transaction${s.todayTransactions === 1 ? "" : "s"} · ${s.todayFamilies} famil${s.todayFamilies === 1 ? "y" : "ies"}`}
          />
        ) : (
          <Card label="Today" value={String(s.todayTransactions)} sub="transactions" />
        )}
        <Card
          label="Discount approvals"
          value={String(s.pendingApprovals)}
          tone={s.pendingApprovals > 0 ? "text-warning" : "text-white"}
          sub={s.pendingApprovals > 0 ? "Pending your sign-off" : "All clear"}
        />
        <Card
          label="Opening checklist"
          value={s.checklistTotal > 0 ? `${s.checklistDone}/${s.checklistTotal}` : "—"}
          tone={s.checklistComplete ? "text-success" : "text-warning"}
          sub={
            s.checklistTotal === 0
              ? "Not started today"
              : s.checklistComplete
                ? `All ${s.checklistTotal} items complete`
                : "Incomplete"
          }
        />
      </div>

      {/* Monthly target tracker — all centres the viewer may see. */}
      {canSeeFinancials && ec.targets.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-1 font-heading text-lg text-white">Monthly target tracker</h2>
          <p className="mb-3 font-body text-xs font-light text-muted">Net of discount, month to date.</p>
          <div className="space-y-2">
            {ec.targets.map((t) => (
              <div key={t.id} className="rounded-lg border border-line bg-card px-4 py-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-body text-sm text-white">
                    {t.name}
                    {t.id === ec.centre.id ? <span className="font-light text-muted"> · this centre</span> : null}
                  </p>
                  <p className="font-body text-xs font-light text-secondary tabular-nums">
                    {inr(t.monthToDate)} / {inr(t.target)} · {t.pctOfTarget}%
                  </p>
                </div>
                <div className="h-1 w-full overflow-hidden bg-line-strong">
                  <div
                    className={`h-full ${t.pctOfTarget >= 85 ? "bg-success" : t.pctOfTarget >= 60 ? "bg-warning" : "bg-error"}`}
                    style={{ width: `${Math.min(100, Math.max(0, t.pctOfTarget))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* The gate itself. */}
      <section className="mb-6">
        <h2 className="mb-1 font-heading text-lg text-white">Discount gate · pending approvals</h2>
        <p className="mb-3 font-body text-xs font-light text-muted">
          Approve before a Client Advisor may share the price. Approval is mandatory at or above{" "}
          {ec.centre.thresholdPct}% at this centre.
        </p>
        {ec.pending.length === 0 ? (
          <div className="rounded-lg border border-line bg-card px-5 py-6">
            <p className="font-body text-sm text-white">Nothing awaiting sign-off</p>
            <p className="mt-0.5 font-body text-xs font-light text-muted">
              Every discount at or above {ec.centre.thresholdPct}% has been approved.
            </p>
          </div>
        ) : (
          <DiscountTable rows={ec.pending} canApprove={canApprove} canSeeFinancials={canSeeFinancials} showAction />
        )}
      </section>

      {/* Settled this month, so the gate's history is visible, breaches included. */}
      {ec.settled.length > 0 ? (
        <section>
          <h2 className="mb-1 font-heading text-lg text-white">Settled this month</h2>
          <p className="mb-3 font-body text-xs font-light text-muted">
            Approved, or below this centre&rsquo;s threshold and never requiring sign-off.
          </p>
          <DiscountTable rows={ec.settled} canApprove={false} canSeeFinancials={canSeeFinancials} />
        </section>
      ) : null}
    </div>
  );
}

function DiscountTable({
  rows,
  canApprove,
  canSeeFinancials,
  showAction = false,
}: {
  rows: DiscountRow[];
  canApprove: boolean;
  canSeeFinancials: boolean;
  showAction?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="bg-surface">
            <Th>Client Advisor</Th>
            <Th>Invoice</Th>
            <Th>Family</Th>
            <Th right>Discount</Th>
            {canSeeFinancials ? <Th right>Net</Th> : null}
            <Th>Status</Th>
            {showAction ? <Th>Action</Th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line bg-card">
              <Td>
                <span className="text-white">{r.advisor ?? "—"}</span>
              </Td>
              <Td>{r.invoiceNumber ?? "—"}</Td>
              <Td>{r.family ?? "—"}</Td>
              <Td right>
                <span className="tabular-nums text-white">{r.discountPct}%</span>
              </Td>
              {canSeeFinancials ? (
                <Td right>
                  <span className="tabular-nums">{inr(r.netAmount)}</span>
                </Td>
              ) : null}
              <Td>
                {r.communicatedBeforeApproval ? (
                  <Badge cls="bg-error/10 text-error">Communicated early</Badge>
                ) : r.approvedAt ? (
                  <Badge cls="bg-success/10 text-success">Approved</Badge>
                ) : r.needsApproval ? (
                  <Badge cls="bg-warning/10 text-warning">Awaiting sign-off</Badge>
                ) : (
                  <Badge cls="bg-surface text-muted">Below threshold</Badge>
                )}
              </Td>
              {showAction ? (
                <Td>
                  {canApprove ? (
                    <ApproveDiscountButton
                      saleId={r.id}
                      label={`Approve ${r.discountPct}% for ${r.family ?? "this family"}`}
                    />
                  ) : (
                    <span className="font-body text-xs font-light text-muted">Country Head only</span>
                  )}
                </Td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-4 py-2.5 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-muted ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className={`px-4 py-3 font-body text-sm font-light text-secondary ${right ? "text-right" : "text-left"}`}>
      {children}
    </td>
  );
}

function Badge({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {children}
    </span>
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

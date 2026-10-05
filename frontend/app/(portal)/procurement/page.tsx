import { MetricCard } from "@/components/dashboard/MetricCard";
import { PurchaseOrdersTable, VrnTable, WorkOrdersTable } from "@/components/procurement/ProcurementTables";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { formatINR } from "@/lib/format";
import { can } from "@/lib/services/permissions";
import { getProcurement, isProcurementDept } from "@/lib/services/procurement";
import {
  awaitingThreeQuotes,
  grnDueToday,
  sortVendors,
  THREE_QUOTES_ABOVE,
  vrnState,
} from "@/lib/services/procurement-logic";

export const dynamic = "force-dynamic";

/**
 * S9 · Procurement (Brief §33) — VRNs, work orders, purchase orders and
 * GRNs due. Read-only for now: raising a VRN or a WO is a later build.
 *
 * Vendors, WOs and POs carry no department, so "own_dept" scope cannot be
 * fenced row by row. The page therefore opens for leadership (scope 'all')
 * and for the Procurement department itself, and for nobody else who
 * happens to hold own_dept read.
 */
export default async function ProcurementPage() {
  const user = await getCurrentUser();
  const decision = await can(user, "read", "procurement");
  const allowed =
    decision.allowed && (decision.scope === "all" || (await isProcurementDept(user)));

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">Procurement</h1>
        <p className="font-body text-sm font-light text-muted">
          Vendors and their VRNs, work orders, and the purchase orders waiting on something.
        </p>
      </div>

      {allowed ? (
        <Desk user={user} />
      ) : (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Procurement view</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            This screen is open to leadership and the Procurement team.
          </p>
        </div>
      )}
    </div>
  );
}

async function Desk({ user }: { user: SessionUser }) {
  const data = await getProcurement(user);
  const { today } = data;
  const active = data.vendors.filter((v) => {
    const s = vrnState(v, today);
    return s === "Active" || s === "Renewal due";
  }).length;
  const renewals = data.vendors.filter((v) => vrnState(v, today) === "Renewal due").length;
  const quotes = data.pos.filter(awaitingThreeQuotes).length;
  const grns = data.pos.filter((po) => grnDueToday(po, today)).length;

  return (
    <>
      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Active VRNs"
          value={String(active)}
          sub={renewals ? `${renewals} due for renewal` : "Registered vendors"}
        />
        <MetricCard
          label="WOs this month"
          value={String(data.wosThisMonth.count)}
          sub={`Total value ${formatINR(data.wosThisMonth.total)}`}
        />
        <MetricCard
          label="POs awaiting 3 quotes"
          value={String(quotes)}
          sub={`Above ${formatINR(THREE_QUOTES_ABOVE)}`}
        />
        <MetricCard label="GRNs due today" value={String(grns)} sub="Deliveries expected" />
      </div>

      <section className="mb-10">
        <h2 className="mb-3 font-heading text-2xl text-white">Purchase orders that need something</h2>
        <PurchaseOrdersTable rows={data.pos} today={today} />
      </section>

      <section className="mb-10">
        <h2 className="mb-1 font-heading text-2xl text-white">Recent work orders</h2>
        <p className="mb-3 font-body text-xs font-light text-muted">
          Third-party scopes carry the 20% coordination charge, added automatically.
        </p>
        <WorkOrdersTable rows={data.recentWos} />
      </section>

      <section>
        <h2 className="mb-1 font-heading text-2xl text-white">VRN status</h2>
        <p className="mb-3 font-body text-xs font-light text-muted">
          VRNs renew every year. Anything expiring in the next 30 days is due for renewal.
        </p>
        <VrnTable rows={sortVendors(data.vendors, today)} today={today} />
      </section>
    </>
  );
}

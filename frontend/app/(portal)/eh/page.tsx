import { CentreSwitcher } from "@/components/eh/CentreSwitcher";
import { ExperienceCentreView } from "@/components/eh/ExperienceCentreView";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { getExperienceCentre, listCentreOptions } from "@/lib/services/eh";

export const dynamic = "force-dynamic";

/**
 * S6 · essentia home — Experience Centre (Brief §28 · Velocity Gate 5), the last
 * Phase-1 Core screen. The Country Head's floor: revenue against target across
 * the three centres, the opening checklist, and the discount control gate — no
 * Client Advisor may communicate a discount until it is approved here.
 *
 * Rows are RLS-scoped (db/029): L0/L1 see every centre, a Country Head sees the
 * one they hold. Revenue is additionally fenced behind financial_access.
 */
export default async function EssentiaHomePage({ searchParams }: { searchParams: { ec?: string } }) {
  const user = await getCurrentUser();
  const [read, approve, financial] = await Promise.all([
    can(user, "read", "eh_sales"),
    can(user, "approve", "eh_sales"),
    can(user, "financial_access", "eh_sales"),
  ]);

  if (!read.allowed) {
    return (
      <Frame>
        <Block
          title="Not available"
          body="essentia home is open to the Experience Centre Country Heads and to leadership."
        />
      </Frame>
    );
  }

  const centres = await listCentreOptions(user);
  if (centres.length === 0) {
    return (
      <Frame>
        <Block
          title="No Experience Centre assigned"
          body="You don't hold a centre yet. A Country Head sees the centre they are assigned to; leadership sees all three."
        />
      </Frame>
    );
  }

  const fromQuery = searchParams.ec && centres.some((c) => c.id === searchParams.ec) ? searchParams.ec : null;
  const selectedId = fromQuery ?? centres[0]!.id;
  const ec = await getExperienceCentre(user, selectedId);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 font-heading text-4xl text-white">essentia home</h1>
          <p className="font-body text-sm font-light text-muted">
            Experience Centre floor and the discount control gate — a price reaches a family only after
            sign-off (Velocity Gate 5).
          </p>
        </div>
        {centres.length > 1 ? <CentreSwitcher centres={centres} currentId={selectedId} /> : null}
      </div>

      {ec ? (
        <ExperienceCentreView
          ec={ec}
          canApprove={approve.allowed}
          canSeeFinancials={financial.allowed}
          isLeadership={read.scope === "all"}
        />
      ) : (
        <Block title="Not available" body="That centre doesn't exist, or it isn't one you hold." />
      )}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="mb-1 font-heading text-4xl text-white">essentia home</h1>
      <p className="mb-6 font-body text-sm font-light text-muted">
        Experience Centre floor and the discount control gate (Velocity Gate 5).
      </p>
      {children}
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-line bg-card px-5 py-6">
      <p className="font-body text-sm text-white">{title}</p>
      <p className="mt-0.5 font-body text-xs font-light text-muted">{body}</p>
    </div>
  );
}

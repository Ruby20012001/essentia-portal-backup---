import { FounderBrief } from "@/components/founder/FounderBrief";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { getFounderBrief, getLatestBriefSnapshot } from "@/lib/services/founder-brief";

export const dynamic = "force-dynamic";

/**
 * S18 · Founder Morning Brief (Brief §37; Velocity Gate #6). The 7 numbers a
 * founder reads every morning — nothing more — each with a threshold status.
 * Gated to read:founder_brief (L0/L1 only, per the permission fencing).
 */
export default async function FounderBriefPage() {
  const user = await getCurrentUser();
  const decision = await can(user, "read", "founder_brief");

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">Founder Morning Brief</h1>
        <p className="font-body text-sm font-light text-muted">
          The 7 numbers, nothing more — read in seven minutes, before the first call of the day.
        </p>
      </div>

      {!decision.allowed ? (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Founders only</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            The Founder Morning Brief is restricted to the founders and senior leadership (L0–L1).
          </p>
        </div>
      ) : (
        <Brief />
      )}
    </div>
  );
}

async function Brief() {
  const [{ numbers }, snapshot] = await Promise.all([getFounderBrief(), getLatestBriefSnapshot()]);
  return (
    <>
      <p className="mb-4 font-body text-xs font-light text-muted">{generatedLabel(snapshot)}</p>
      <FounderBrief numbers={numbers} />
    </>
  );
}

function generatedLabel(snapshot: { briefDate: string; generatedAt: string } | null): string {
  if (!snapshot) return "Auto-pilot · scheduled daily at 06:30 — not yet generated";
  const t = new Date(snapshot.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return `Auto-pilot · last generated ${snapshot.briefDate} at ${t}`;
}

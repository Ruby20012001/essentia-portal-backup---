import { MetricCard } from "@/components/dashboard/MetricCard";
import { DefinitionsTable } from "@/components/workflows/DefinitionsTable";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { listWorkflowDefinitions } from "@/lib/services/workflow-definitions";

export const dynamic = "force-dynamic";

/**
 * S20 · Workflow Definitions (admin, screen 6). Lists every definition with its
 * shape and live usage, and offers Edit / Duplicate / Archive. Gated on
 * edit:workflows — the same authority the mutations themselves require, so the
 * screen never shows actions the API would refuse.
 */
export default async function WorkflowDefinitionsPage() {
  const user = await getCurrentUser();
  const decision = await can(user, "edit", "workflows");

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">Workflow Definitions</h1>
        <p className="font-body text-sm font-light text-muted">
          The approval chains the portal runs. Archiving stops new workflows starting — work already
          running is never interrupted.
        </p>
      </div>

      {!decision.allowed ? (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Administrator view</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            Editing workflow definitions is restricted to leadership and platform administrators.
          </p>
        </div>
      ) : (
        <Definitions user={user} />
      )}
    </div>
  );
}

async function Definitions({ user }: { user: Parameters<typeof listWorkflowDefinitions>[0] }) {
  const definitions = await listWorkflowDefinitions(user);
  const active = definitions.filter((d) => d.isActive).length;
  const running = definitions.reduce((n, d) => n + d.runningCount, 0);

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Definitions" value={String(definitions.length)} />
        <MetricCard label="Active" value={String(active)} sub="can be started" />
        <MetricCard label="Archived" value={String(definitions.length - active)} sub="no new instances" />
        <MetricCard label="Running now" value={String(running)} sub="live instances" />
      </div>

      <DefinitionsTable initial={definitions} />
    </>
  );
}

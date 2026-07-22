import Link from "next/link";
import { WorkflowBuilder } from "@/components/workflows/WorkflowBuilder";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { getWorkflowDefinitionDetail, getBuilderOptions } from "@/lib/services/workflow-builder";

export const dynamic = "force-dynamic";

/**
 * S24 · Workflow Builder (screen 5). Visual editor for one definition's approval
 * chain. Gated on edit:workflows (leadership / platform admin). The definition is
 * editable only when it is a draft/inactive with no running instances; otherwise
 * the builder shows it read-only with a Duplicate action.
 */
export default async function WorkflowBuilderPage({ params }: { params: { code: string } }) {
  const user = await getCurrentUser();
  const decision = await can(user, "edit", "workflows");

  if (!decision.allowed) {
    return (
      <Frame>
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Administrator view</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            Building and editing workflows is restricted to leadership and platform administrators.
          </p>
        </div>
      </Frame>
    );
  }

  const [detail, options] = await Promise.all([
    getWorkflowDefinitionDetail(user, params.code),
    getBuilderOptions(user),
  ]);

  if (!detail) {
    return (
      <Frame>
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Not found</p>
          <p className="mt-1 font-body text-sm font-light text-muted">That workflow definition does not exist.</p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame subtitle={`${detail.code} · ${detail.editable ? "editing draft" : "read-only"}`}>
      <WorkflowBuilder detail={detail} options={options} />
    </Frame>
  );
}

function Frame({ subtitle, children }: { subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6">
        <Link href="/workflow-definitions" className="font-body text-xs font-bold text-muted hover:text-white">
          ← Workflow Definitions
        </Link>
        <h1 className="mt-1 font-heading text-4xl text-white">Workflow Builder</h1>
        {subtitle ? <p className="font-body text-sm font-light text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

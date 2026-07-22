import Link from "next/link";
import { NewDefinitionForm } from "@/components/workflows/NewDefinitionForm";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { getBuilderOptions } from "@/lib/services/workflow-builder";

export const dynamic = "force-dynamic";

/**
 * S24 · New workflow definition (screen 5, create path). Gated on
 * create:workflows. Creates a draft, then redirects into the builder.
 */
export default async function NewWorkflowPage() {
  const user = await getCurrentUser();
  const decision = await can(user, "create", "workflows");

  return (
    <div>
      <div className="mb-6">
        <Link href="/workflow-definitions" className="font-body text-xs font-bold text-muted hover:text-white">
          ← Workflow Definitions
        </Link>
        <h1 className="mt-1 font-heading text-4xl text-white">New workflow</h1>
        <p className="font-body text-sm font-light text-muted">
          Create a draft, then build its approval chain. Nothing runs until you activate it.
        </p>
      </div>

      {!decision.allowed ? (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Administrator view</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            Creating workflows is restricted to leadership and platform administrators.
          </p>
        </div>
      ) : (
        <NewDefinitionForm options={await getBuilderOptions(user)} />
      )}
    </div>
  );
}

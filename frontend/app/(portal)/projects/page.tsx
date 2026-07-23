import { ProjectHub } from "@/components/projects/ProjectHub";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { listProjectHub } from "@/lib/services/project-hub";

export const dynamic = "force-dynamic";

/**
 * S25 · Project Hub (Brief · Project Hub) — the central record for every active
 * project. All project staff; row visibility is RLS-scoped (you see only your
 * projects). Financial columns appear only for users who can read billing.
 */
export default async function ProjectsPage() {
  const user = await getCurrentUser();
  const [decision, billing] = await Promise.all([
    can(user, "read", "projects"),
    can(user, "read", "billing"),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">Project Hub</h1>
        <p className="font-body text-sm font-light text-muted">
          Every active project — health, phase, team and commercials in one place. Every other module
          links back here.
        </p>
      </div>

      {!decision.allowed ? (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Not available</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            You don&apos;t have access to the project register.
          </p>
        </div>
      ) : (
        <ProjectHub initial={await listProjectHub(user)} canSeeFinancials={billing.allowed} />
      )}
    </div>
  );
}

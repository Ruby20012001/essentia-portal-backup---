import Link from "next/link";
import { ProjectDetailView } from "@/components/projects/ProjectDetailView";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { getProjectDetail } from "@/lib/services/project-hub";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/**
 * S25 · Project detail — one project's central record. RLS decides visibility:
 * getProjectDetail returns null if the project doesn't exist or the caller isn't
 * on it, and we render the same "not available" either way (no existence leak).
 */
export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const [decision, billing] = await Promise.all([
    can(user, "read", "projects"),
    can(user, "read", "billing"),
  ]);

  const detail = invalidId(params.id) || !decision.allowed ? null : await getProjectDetail(user, params.id);

  return (
    <div>
      <div className="mb-6">
        <Link href="/projects" className="font-body text-xs font-bold text-muted hover:text-white">
          ← Project Hub
        </Link>
        <h1 className="mt-1 font-heading text-4xl text-white">Project</h1>
      </div>

      {!detail ? (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Not available</p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            This project doesn&apos;t exist, or it isn&apos;t assigned to you.
          </p>
        </div>
      ) : (
        <ProjectDetailView detail={detail} canSeeFinancials={billing.allowed} />
      )}
    </div>
  );
}

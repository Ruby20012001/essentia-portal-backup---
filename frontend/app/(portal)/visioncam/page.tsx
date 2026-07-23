import { ProjectSwitcher } from "@/components/design/ProjectSwitcher";
import { VisionCamView } from "@/components/visioncam/VisionCamView";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { listProjectOptions } from "@/lib/services/projects";
import { getVisionCam, getLatestVisionCamProject } from "@/lib/services/visioncam";

export const dynamic = "force-dynamic";

/**
 * S3 · VisionCAM (Brief §35 · Velocity Gate 1) — the site-photo log + the billing
 * gate (a VisionCAM-triggered milestone can't invoice until its photo is captured
 * and QC-passed). Read-only monitor; capture is the mobile app. All project staff;
 * RLS-scoped by project. Billing amounts show only for read:billing.
 */
export default async function VisionCamPage({ searchParams }: { searchParams: { project?: string } }) {
  const user = await getCurrentUser();
  const [decision, billing] = await Promise.all([can(user, "read", "projects"), can(user, "read", "billing")]);

  if (!decision.allowed) {
    return (
      <Frame>
        <Block title="Not available" body="You don't have access to VisionCAM." />
      </Frame>
    );
  }

  const projects = await listProjectOptions(user);
  if (projects.length === 0) {
    return (
      <Frame>
        <Block title="No projects" body="No projects are visible to you yet." />
      </Frame>
    );
  }

  const fromQuery = searchParams.project && projects.some((p) => p.id === searchParams.project) ? searchParams.project : null;
  const selectedId = fromQuery ?? (await getLatestVisionCamProject(user)) ?? projects[0]!.id;
  const vc = await getVisionCam(user, selectedId);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 font-heading text-4xl text-white">VisionCAM</h1>
          <p className="font-body text-sm font-light text-muted">
            Site-photo capture and the billing gate — a photo releases the milestone (Velocity Gate 1).
          </p>
        </div>
        <ProjectSwitcher projects={projects} currentId={selectedId} basePath="/visioncam" />
      </div>

      {vc ? (
        <VisionCamView vc={vc} canSeeFinancials={billing.allowed} />
      ) : (
        <Block title="Not available" body="That project doesn't exist, or it isn't assigned to you." />
      )}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">VisionCAM</h1>
        <p className="font-body text-sm font-light text-muted">Site-photo capture and the billing gate (Velocity Gate 1).</p>
      </div>
      {children}
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
      <p className="font-heading text-2xl text-white">{title}</p>
      <p className="mt-1 font-body text-sm font-light text-muted">{body}</p>
    </div>
  );
}

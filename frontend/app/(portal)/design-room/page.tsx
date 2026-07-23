import { ProjectSwitcher } from "@/components/design/ProjectSwitcher";
import { DesignRoomView } from "@/components/design/DesignRoomView";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/services/permissions";
import { listProjectOptions } from "@/lib/services/projects";
import { getDesignRoom } from "@/lib/services/design-room";

export const dynamic = "force-dynamic";

/**
 * S5 · Design Room (Brief §29) — the 14-stage Drawing Ladder for a project.
 * All project staff; row visibility is RLS-scoped (you see only your projects).
 * Read-only tracker; the ?project= query switches which project is shown.
 */
export default async function DesignRoomPage({ searchParams }: { searchParams: { project?: string } }) {
  const user = await getCurrentUser();
  const decision = await can(user, "read", "projects");

  if (!decision.allowed) {
    return (
      <Frame>
        <Block title="Not available" body="You don't have access to the design register." />
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

  const selectedId =
    searchParams.project && projects.some((p) => p.id === searchParams.project)
      ? searchParams.project
      : projects[0]!.id;
  const room = await getDesignRoom(user, selectedId);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 font-heading text-4xl text-white">Design Room</h1>
          <p className="font-body text-sm font-light text-muted">
            The 14-stage Drawing Ladder (Brief §29).
            {room?.project.designer ? (
              <>
                {" "}
                Designer: <span className="text-secondary">{room.project.designer}</span>.
              </>
            ) : null}
          </p>
        </div>
        <ProjectSwitcher projects={projects} currentId={selectedId} basePath="/design-room" />
      </div>

      {room ? (
        <DesignRoomView room={room} />
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
        <h1 className="mb-1 font-heading text-4xl text-white">Design Room</h1>
        <p className="font-body text-sm font-light text-muted">The 14-stage Drawing Ladder (Brief §29).</p>
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

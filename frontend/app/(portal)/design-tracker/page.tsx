import { SetupNeeded } from "@/components/dashboard/SetupNeeded";
import { EmptyState } from "@/components/ui/EmptyState";
import { DesignTrackerBoard } from "@/components/design-tracker/DesignTrackerBoard";
import { getCurrentUser } from "@/lib/auth/session";
import { missingPageEnv } from "@/lib/env";
import { PermissionError } from "@/lib/services/permissions";
import { getDesignBoard } from "@/lib/services/design-tracker";

export const dynamic = "force-dynamic";

/**
 * S4c · Design Activity Tracker — the WIO → PIO Tracker's shape, run on the
 * design activity chart. Vishakha's page: her designers, their projects, and
 * which project is late on which activity, depending on whom.
 */
export default async function DesignTrackerPage({
  searchParams,
}: {
  searchParams?: { person?: string };
}) {
  const missing = missingPageEnv();
  if (missing.length > 0) {
    return (
      <div>
        <PageTitle />
        <div className="mt-6">
          <SetupNeeded missing={missing} />
        </div>
      </div>
    );
  }

  const user = await getCurrentUser();

  let board;
  try {
    board = await getDesignBoard(user);
  } catch (error) {
    if (error instanceof PermissionError) {
      return (
        <div>
          <PageTitle />
          <div className="mt-6">
            <EmptyState title="You don't have access to this board" message={error.message} />
          </div>
        </div>
      );
    }
    throw error;
  }

  return (
    /* The title is the board's own, not the page's: whose board is being read
       changes when a designer is picked, and that does not reload the page.
       PageTitle stays for the paths below, which render before there is a
       board to ask. */
    <div>
      <DesignTrackerBoard initial={board} openAt={searchParams?.person ?? null} />
    </div>
  );
}

/**
 * The page's own title. Whose board this is comes first and large — it is read
 * across a room, off a shared screen (Monica, 18 Sep: "Vishakha's dashboard
 * bada bada"). The screen code and what it measures drop to the line beneath,
 * where they are still available but no longer the headline.
 *
 * Only the paths that have no board use this — no access, or the database
 * unreachable. Where there IS a board, the board titles itself, because the
 * name in the title changes without the page being rendered again.
 */
function PageTitle({ teamName, headName }: { teamName?: string; headName?: string }) {
  return (
    <div>
      <h1 className="mb-1 font-heading text-5xl leading-tight text-white md:text-6xl">
        {headName ? `${headName}'s Dashboard` : "Design Activity Tracker"}
      </h1>
      <p className="font-body text-sm font-light text-label">
        S4c · Design Activity Tracker — every project against the activity chart, what is late,
        and whom it depends on
        {teamName ? ` · ${teamName}` : ""}
      </p>
    </div>
  );
}

import { SetupNeeded } from "@/components/dashboard/SetupNeeded";
import { EmptyState } from "@/components/ui/EmptyState";
import { WioTrackerBoard } from "@/components/wio-tracker/WioTrackerBoard";
import { getCurrentUser } from "@/lib/auth/session";
import { missingPageEnv } from "@/lib/env";
import { PermissionError } from "@/lib/services/permissions";
import { getBoard } from "@/lib/services/wio-tracker";

export const dynamic = "force-dynamic";

/**
 * S4b · WIO → PIO Tracker — Brief §29-30.
 *
 * The stage-chain cut of the §30 process, distinct from the S4 WIO/PIO Hub at
 * /wio-pio: that screen runs the department WIO conversion checklist, this one
 * answers "who is holding this, and for how long". Both read the same window;
 * neither owns the other's rows.
 *
 * Access is RBAC-gated (db/030). A viewer without read gets a plain sentence
 * rather than an empty board, because an empty board looks like good news.
 */
export default async function WioTrackerPage() {
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
    board = await getBoard(user);
  } catch (error) {
    if (error instanceof PermissionError) {
      return (
        <div>
          <PageTitle />
          <div className="mt-6">
            <EmptyState
              title="You don't have access to this board"
              message="The WIO → PIO Tracker is held by the team that runs the stage chain, with view access for CRM and leadership. Ask Ruby if you need to be added — access is a permission row, not a code change."
            />
          </div>
        </div>
      );
    }
    throw error;
  }

  return (
    <div>
      <div className="mb-6">
        <PageTitle teamName={board.settings.teamName} />
      </div>
      <WioTrackerBoard initial={board} />
    </div>
  );
}

function PageTitle({ teamName }: { teamName?: string }) {
  return (
    <div>
      <h1 className="mb-1 font-heading text-4xl text-white">WIO → PIO Tracker</h1>
      <p className="font-body text-sm font-light text-label">
        S4b · The 15-day window, stage by stage — Brief §29–30
        {teamName ? ` · ${teamName}` : ""}
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import { BoardAccount } from "@/components/wio-tracker/BoardAccount";
import { ModeSwitch } from "@/components/team-weekly/ModeSwitch";
import { StageTrackerBoard } from "@/components/stage-tracker/StageTrackerBoard";
import { getSession } from "@/lib/auth/session";
import { getPublicStageBoard, getStageBoard } from "@/lib/services/stage-tracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stage Tracker · essentia",
  robots: { index: false, follow: false },
};

/**
 * The Stage Tracker — the MASTER SHEET's ID, 3D and Architecture phases
 * (Monica, 8 Oct): "sabse pehle ID tracker khulega, uske barabar mein 2
 * button honge, 3D aur Architecture". Filled and updated daily on the page;
 * what changed today is marked.
 *
 * Open to read, like /board (Monica, 8 Oct, for a demo: "password hatado"):
 *
 *   nobody signed in        →  the whole board, read only
 *   signed in, design team  →  the same, and every cell editable
 *
 * The controls are not the guarantee — every write goes through
 * /api/stage-board/*, which needs a session on the design team's list.
 */
export default async function StageBoardPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const session = await getSession().catch(() => null);

  const board = await (session ? getStageBoard(session.user) : getPublicStageBoard()).catch(
    (error: Error) => error,
  );
  const tab = searchParams.tab === "3d" || searchParams.tab === "arch" ? searchParams.tab : "id";

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-espresso px-4 md:px-6">
        <Image src="/brand/logo-dark.png" alt="essentia" height={20} width={102} priority />
        <div className="flex items-center gap-4">
          <p className="hidden font-body text-[10px] font-light uppercase tracking-[0.22em] text-cream/50 md:block">
            Stage Tracker
          </p>
          <ModeSwitch />
          <BoardAccount name={session?.user.name ?? null} next="/stage-board" />
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-8">
        {board instanceof Error ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center">
            <p className="font-body text-sm font-light text-secondary">{board.message}</p>
          </div>
        ) : (
          <StageTrackerBoard initial={board} initialTab={tab} readOnly={!session} />
        )}
      </main>
    </div>
  );
}

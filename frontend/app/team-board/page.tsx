import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { BoardAccount } from "@/components/wio-tracker/BoardAccount";
import { ModeSwitch } from "@/components/team-weekly/ModeSwitch";
import { TeamWeeklyBoard } from "@/components/team-weekly/TeamWeeklyBoard";
import { getSession } from "@/lib/auth/session";
import { getTeamWeeklyBoard } from "@/lib/services/team-weekly";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team Weekly Board · essentia",
  robots: { index: false, follow: false },
};

/**
 * The Team Weekly Board — Jiya's log of what Team Ritu, Lavika, Prerna,
 * Vritika, Aryan and Navya did this week, against RK / MR / JKR and Layouts /
 * Intents / SLD. The WIO board's shape, its own page and its own data (Monica,
 * 7 Oct: "alag chahiye, wo same nahi").
 *
 * Signed in first, like /design-board: the people who keep it are the design
 * team, and nobody else has a reason to read it.
 */
export default async function TeamBoardPage() {
  /* No sign-in (Monica, 8 Oct: "bina pass ke"). The link opens the board;
     somebody signed in is still named. TEAM_BOARD_REQUIRE_LOGIN=true puts
     the door back. */
  const session = await getSession().catch(() => null);
  if (!session && process.env.TEAM_BOARD_REQUIRE_LOGIN === "true") {
    redirect("/login?next=%2Fteam-board");
  }

  const board = await getTeamWeeklyBoard(session?.user ?? null).catch((error: Error) => error);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-espresso px-4 md:px-6">
        <Image src="/brand/logo-dark.png" alt="essentia" height={20} width={102} priority />
        <div className="flex items-center gap-4">
          <p className="hidden font-body text-[10px] font-light uppercase tracking-[0.22em] text-cream/50 md:block">
            Team Weekly Board
          </p>
          <ModeSwitch />
          {session ? <BoardAccount name={session.user.name} next="/team-board" /> : null}
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-8">
        {board instanceof Error ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center">
            <p className="font-body text-sm font-light text-secondary">{board.message}</p>
          </div>
        ) : (
          <>
            <TeamWeeklyBoard initial={board} />
            <p className="mt-10 border-t border-line pt-4 font-body text-[11px] font-light text-muted">
              {session ? (
                <>
                  You are signed in as <span className="text-secondary">{session.user.name}</span> —{" "}
                </>
              ) : null}
              What you add saves for everyone. Remove takes an entry off for good; use it once the week has been read.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

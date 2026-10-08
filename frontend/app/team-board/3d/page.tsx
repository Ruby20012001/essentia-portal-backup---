import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BoardAccount } from "@/components/wio-tracker/BoardAccount";
import { ModeSwitch } from "@/components/team-weekly/ModeSwitch";
import { Team3dBoard } from "@/components/team-weekly/Team3dBoard";
import { getSession } from "@/lib/auth/session";
import { getTeam3dBoard } from "@/lib/services/team-weekly";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "3D Board · essentia",
  robots: { index: false, follow: false },
};

/**
 * The 3D page, behind the "3D" button on the Team Weekly Board (Monica,
 * 7 Oct): Team Neeru and Team Dhruv, each project Ongoing, in Revisions, or
 * at Signoff — all of it Jiya's to edit.
 */
export default async function Team3dPage() {
  const session = await getSession().catch(() => null);
  if (!session) redirect("/login?next=%2Fteam-board%2F3d");

  const board = await getTeam3dBoard(session.user).catch((error: Error) => error);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-espresso px-4 md:px-6">
        <Image src="/brand/logo-dark.png" alt="essentia" height={20} width={102} priority />
        <div className="flex items-center gap-4">
          <p className="hidden font-body text-[10px] font-light uppercase tracking-[0.22em] text-cream/50 md:block">
            3D Board
          </p>
          <ModeSwitch />
          <BoardAccount name={session.user.name} next="/team-board/3d" />
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-8">
        <Link
          href="/team-board"
          className="mb-5 inline-block font-body text-xs font-light text-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink"
        >
          ← Team Weekly Board
        </Link>
        {board instanceof Error ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center">
            <p className="font-body text-sm font-light text-secondary">{board.message}</p>
          </div>
        ) : (
          <Team3dBoard initial={board} />
        )}
      </main>
    </div>
  );
}

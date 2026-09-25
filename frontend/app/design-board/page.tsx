import type { Metadata } from "next";
import Image from "next/image";
import { BoardAccount } from "@/components/wio-tracker/BoardAccount";
import { DesignBoardMenu } from "@/components/design-tracker/DesignBoardMenu";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { DesignTrackerBoard } from "@/components/design-tracker/DesignTrackerBoard";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDesignBoard } from "@/lib/services/design-tracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Design Activity Tracker · essentia",
  robots: { index: false, follow: false },
};

/**
 * The design board — one link, and it asks who you are first.
 *
 * Monica, 25 Sep: "sabse pehle login chahiye, uske andar jaakar Vishakha ka."
 * I had built the other thing first — the board open to anybody, with a sign-in
 * in the corner, because that is how /board works and she had said "jaise WIO
 * me tha". The shape is the same; where the door sits is not. The WIO board is
 * read by most of essentia, so it opens and offers a sign-in. This one is read
 * by five people, so it asks at the door.
 *
 *   the head       →  the whole team's board, to read
 *   a designer     →  her own projects, and a pen
 *
 * WHAT DECIDES IS THE ACCOUNT, NOT THE ADDRESS. getDesignBoard resolves what
 * somebody may do from the design team's own list, exactly as /design-tracker
 * does, and hands the same board to the same component.
 *
 * AND THE PAGE IS NOT THE GUARD. Every write goes through
 * /api/design-tracker/*, which reads a session of its own. This redirect is
 * how somebody is greeted, not what stops them.
 */
export default async function DesignBoardPage() {
  const session = await getSession().catch(() => null);
  if (!session) redirect("/login?next=%2Fdesign-board");

  /* Somebody signed in who is not on the design team's list lands here too —
     sending them to the portal's own page is better than an error, because
     that page says in words that the board is not theirs. */
  const board = await getDesignBoard(session.user).catch(() => null);
  if (!board) redirect("/design-tracker");

  /* The same three for everyone. Dashboard is this page, and this page is
     whosever board it is — the head's reading of the team, or a designer's of
     her own projects. */
  const menu = [
    { label: "Dashboard", href: "/design-board", here: true },
    { label: "Tracker", href: "/design-tracker" },
    { label: "Concept deck", href: "/decks" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-espresso px-4 md:px-6">
        <div className="flex items-center gap-4">
          {/* Behind ☰, in a card from the side — not a row of words across
              the top (Monica, 25 Sep). The board is a wide table, and a
              column standing beside it would cost the width people read. */}
          <DesignBoardMenu items={menu} />
          <Image src="/brand/logo-dark.png" alt="essentia" height={20} width={102} priority />
        </div>

        <div className="flex items-center gap-4">
          <p className="hidden font-body text-[10px] font-light uppercase tracking-[0.22em] text-cream/50 md:block">
            Design Activity Tracker{board.can.edit ? "" : " · view only"}
          </p>
          {/* Who you are and the way out. Everybody here is signed in, so
              this is always the name and Sign out — signing out lands on the
              sign-in page, which is where this link starts. */}
          <ThemeToggle />
          <BoardAccount name={session.user.name} next="/design-board" />
        </div>
      </header>

      <main id="board" className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-8">
        {/* The same board the team works, from the same computation — so this
            page and the portal can never disagree about what is late. */}
        <DesignTrackerBoard initial={board} />

        <p className="mt-10 border-t border-line pt-4 font-body text-[11px] font-light text-muted">
          {board.can.edit ? (
            <>
              You are signed in as{" "}
              <span className="text-secondary">{session?.user.name}</span> — what
              you tick saves for everyone.
            </>
          ) : (
            <>Reading only. Sign in to record your own work.</>
          )}
        </p>
      </main>
    </div>
  );
}

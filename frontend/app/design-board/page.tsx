import type { Metadata } from "next";
import Image from "next/image";
import { BoardAccount } from "@/components/wio-tracker/BoardAccount";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { DesignTrackerBoard } from "@/components/design-tracker/DesignTrackerBoard";
import { getSession } from "@/lib/auth/session";
import { getDesignBoard, getPublicDesignBoard } from "@/lib/services/design-tracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Design Activity Tracker · essentia",
  robots: { index: false, follow: false },
};

/**
 * The design board — one link, for everybody. The WIO board's shape, which is
 * the shape Monica asked for by name on 25 Sep: "jaise WIO me tha."
 *
 *   nobody signed in     →  the head's board, read only
 *   signed in, the head  →  the same, plus Team performance, Setup, reminders
 *   signed in, a designer →  her own projects, and a pen
 *
 * WHAT DECIDES IS THE ACCOUNT, NOT THE URL. getDesignBoard resolves what
 * somebody may do from the design team's own list, exactly as /design-tracker
 * does, and hands the same board to the same component. Signing in here gets
 * you what you would get anywhere.
 *
 * AND THE CONTROLS ARE NOT THE GUARANTEE. Every write goes through
 * /api/design-tracker/*, which reads a session. Somebody opening this page
 * signed out cannot change the board by calling those endpoints by hand,
 * because there is no session here that could authorise them.
 *
 * WHAT IS ON THE PAGE. Client names, what is late and whom it waits on. That
 * is the same judgement already made for /board — internal working
 * information rather than anything confidential — and the same two things
 * follow from it: noindex, and a link that is given rather than published.
 */
export default async function DesignBoardPage() {
  const session = await getSession().catch(() => null);

  /* A signed-in account gets its own board; anything that goes wrong getting
     it — no access, an expired session, a database hiccup — falls back to the
     open one rather than an error page. The link has to keep working. */
  let board = session ? await getDesignBoard(session.user).catch(() => null) : null;
  const signedIn = board !== null;
  if (!board) board = await getPublicDesignBoard();

  const own = board.viewer.scope === "own";
  /* Signed out, /decks refuses — it opens for accounts. /deck is the open
     list, and is where an unsigned reader should be sent. */
  const deckHref = signedIn ? "/decks" : "/deck";

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-espresso px-4 md:px-6">
        <div className="flex items-center gap-6">
          <Image src="/brand/logo-dark.png" alt="essentia" height={20} width={102} priority />
          {/* What there is to go to, said in three words rather than hidden
              behind a menu: this page, the board on it, and the decks. A
              designer has no team dashboard to read, so hers says Projects. */}
          <nav aria-label="Design" className="hidden items-center gap-5 sm:flex">
            <span className="font-body text-[10px] font-bold uppercase tracking-[0.14em] text-cream">
              {own ? "Projects" : "Dashboard"}
            </span>
            {own ? null : (
              <a
                href="#board"
                className="font-body text-[10px] font-bold uppercase tracking-[0.14em] text-cream/50 transition-colors hover:text-cream"
              >
                Tracker
              </a>
            )}
            <a
              href={deckHref}
              className="font-body text-[10px] font-bold uppercase tracking-[0.14em] text-cream/50 transition-colors hover:text-cream"
            >
              Concept deck
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <p className="hidden font-body text-[10px] font-light uppercase tracking-[0.22em] text-cream/50 md:block">
            Design Activity Tracker{board.can.edit ? "" : " · view only"}
          </p>
          {/* Becoming somebody who can edit belongs on the page you are
              already looking at — otherwise it means hunting for a second
              URL, which is the thing one link exists to avoid. */}
          <ThemeToggle />
          <BoardAccount name={session?.user.name ?? null} next="/design-board" />
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

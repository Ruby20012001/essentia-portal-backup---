import type { Metadata } from "next";
import Image from "next/image";
import { BoardAccount } from "@/components/wio-tracker/BoardAccount";
import { DesignBoardMenu } from "@/components/design-tracker/DesignBoardMenu";
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

  /* The same three for everyone (Monica, 25 Sep: "inke par bhi dashboard,
     inka khud ka"). Dashboard is this page, and this page is whosever board
     it is — the head's reading of the team, or a designer's of her own
     projects. There was no reason for a designer's card to be shorter.

     Empty when signed out, which is what stops the menu offering a refusal:
     everywhere it leads asks for an account. */
  const menu = signedIn
    ? [
        { label: "Dashboard", href: "/design-board", here: true },
        { label: "Tracker", href: "/design-tracker" },
        { label: "Concept deck", href: "/decks" },
      ]
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-espresso px-4 md:px-6">
        <div className="flex items-center gap-4">
          {/* Behind ☰, in a card from the side — not a row of words across
              the top (Monica, 25 Sep). Signed out it is not there at all:
              everywhere it leads asks for an account. */}
          <DesignBoardMenu items={menu} />
          <Image src="/brand/logo-dark.png" alt="essentia" height={20} width={102} priority />
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

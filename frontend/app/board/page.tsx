import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { WioTrackerBoard } from "@/components/wio-tracker/WioTrackerBoard";
import { getSession } from "@/lib/auth/session";
import { getBoard, getPublicBoard } from "@/lib/services/wio-tracker";

export const dynamic = "force-dynamic";

/**
 * The board — one link, for everybody.
 *
 * Ruby, 2026-09-07: "alag alag nahi chahiye". Two links (an open one and a
 * signed-in one) meant the whole company had to be told which of the two was
 * theirs, and the six who edit had to remember they were on the wrong one. So
 * this page adapts to whoever opens it instead:
 *
 *   nobody signed in        →  read-only
 *   signed in, view-only    →  read-only, by name
 *   signed in, WIO team     →  the working board, with every control
 *
 * WHAT DECIDES IS THE ACCOUNT, NOT THE URL. getBoard resolves capabilities from
 * the permission rows, exactly as /wio-tracker does; this page passes the same
 * board to the same component. A view-only account signed in here gets what it
 * would get anywhere — read, and nothing else.
 *
 * AND THE CONTROLS ARE NOT THE GUARANTEE. Every write goes through
 * /api/wio-tracker/*, each of which calls requirePermission. Someone who opens
 * this page signed out cannot change the board even by calling those endpoints
 * by hand, because there is no session here that could authorise them. Hiding
 * a button is courtesy; the route is the lock.
 *
 * WHAT IS ON THE PAGE. Client names, scopes, and who is holding what up. Ruby's
 * judgement is that this is internal working information rather than anything
 * confidential, and that is hers to make. Two things follow from it being on
 * the open internet, and neither is optional:
 *
 *   · noindex — a link somebody forwards is one thing, the board turning up in
 *     a search for a client's name is another.
 *   · BOARD_KEY — set it, and the link needs ?k=<key>, which keeps it out of
 *     reach of anyone who has not been given it and can be changed the day
 *     that matters. Leave it unset and the page is simply open. The choice
 *     lives in one environment variable rather than in the code.
 */

export const metadata: Metadata = {
  title: "WIO → PIO Tracker",
  robots: { index: false, follow: false },
};

export default async function PublicBoardPage({
  searchParams,
}: {
  searchParams: { k?: string };
}) {
  const key = process.env.BOARD_KEY;
  // 404 rather than 403: a wrong key should not confirm that a right one exists.
  if (key && searchParams.k !== key) notFound();

  const session = await getSession().catch(() => null);

  // A signed-in account gets its own board; anything that goes wrong resolving
  // it — no read permission, an expired session, a database hiccup — falls back
  // to the open one rather than to an error page. The link has to keep working.
  let board = null;
  if (session) {
    board = await getBoard(session.user).catch(() => null);
  }
  const signedIn = board !== null;
  if (!board) board = await getPublicBoard();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-espresso px-4 md:px-6">
        <Image src="/brand/logo-dark.png" alt="essentia" height={20} width={102} priority />
        <p className="font-body text-[10px] font-light uppercase tracking-[0.22em] text-cream/50">
          WIO → PIO Tracker{board.can.edit ? "" : " · view only"}
        </p>
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-8">
        {/* The same board the team works, drawn from the same computation — so
            this page and the portal can never disagree about what is late. */}
        <WioTrackerBoard initial={board} />

        <p className="mt-10 border-t border-line pt-4 font-body text-[11px] font-light text-muted">
          {board.can.edit ? (
            <>
              You are signed in as{" "}
              <span className="text-secondary">{session?.user.name}</span> — your
              changes save for everyone.
            </>
          ) : (
            <>
              This is a read-only view. To move a stage or log a delay,{" "}
              <a
                href="/login?next=/board"
                className="underline decoration-line-strong underline-offset-2"
              >
                sign in
              </a>
              {signedIn ? " with a WIO team account" : ""}.
            </>
          )}
        </p>
      </main>
    </div>
  );
}

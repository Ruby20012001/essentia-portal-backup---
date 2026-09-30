import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { BoardAccount } from "@/components/wio-tracker/BoardAccount";
import { DesignBoardMenu } from "@/components/design-tracker/DesignBoardMenu";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { DesignTrackerBoard } from "@/components/design-tracker/DesignTrackerBoard";
import { getSession } from "@/lib/auth/session";
import { getDesignBoard } from "@/lib/services/design-tracker";

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
export default async function DesignBoardPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const session = await getSession().catch(() => null);
  /* Sign in first, then the board — Monica, 30 Sep: "open karte hi Vishakha
     mam ka dashboard aa raha hai; sabse pehle sign-in ka aana chahiye, phir
     Vishakha mam dashboard." It read open-to-anybody for a while because she
     had said "jaise WIO me tha" and that is how /board works; the shape is
     the same, where the door sits is not. The WIO board is read by most of
     essentia. This one is read by five people. */
  if (!session) redirect("/login?next=%2Fdesign-board");

  /* Somebody signed in who is not on the design team's list lands here too —
     the portal's own page says in words that the board is not theirs, which
     is better than an error. */
  const board = await getDesignBoard(session.user).catch(() => null);
  if (!board) redirect("/design-tracker");

  /* Three things, and nothing else in the card — Monica said it in those
     words on 25 Sep: "uske card ke andar kuch bhi nahi ho, sirf 3 cheezein."
     The same three whoever is looking, signed in or not.

     Everybody reading this is signed in, so each of them goes to its own
     page rather than standing in for one. */
  const menu = [
    { label: "Dashboard", href: "/design-board", here: !searchParams?.tab },
    /* Team performance is a tab, not a page, so the card links to the board
       with the tab named — which is why the board reads ?tab= at all. Only
       for whoever is sent the whole team: a designer's card stays at three,
       because for her that page would be one card measured against nobody. */
    ...(board.viewer.scope === "all"
      ? [
          {
            label: "Team performance",
            href: "/design-board?tab=team",
            here: searchParams?.tab === "team",
          },
        ]
      : []),
    { label: "Tracker", href: "/design-tracker" },
    { label: "Concept deck", href: "/decks" },
    /* The same way in, in the card as well as the header (Monica, 30 Sep:
       "card par bhi rahega, dono taraf"). Only on the head's reading — a
       designer is already the person she needs to be. */
    ...(board.viewer.scope === "all"
      ? [{ label: "Sign in to edit", href: "/login?next=%2Fdesign-board", apart: true }]
      : []),
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
          {/* Becoming somebody who can edit belongs on the page you are
              already looking at — otherwise it means hunting for a second
              URL, which is the thing one link exists to avoid. */}
          <ThemeToggle />
          {/* The door is Vishakha's; this is the one inside it (Monica, 30
              Sep: "wo sign in sirf Vishakha ka hai, uske andar ka sign in
              aur banao, baaki sab ke liye"). She opens the board, and the
              four sign in from the board itself rather than being sent back
              to a link. /login takes the form from somebody already signed
              in, so whoever uses this replaces the session and lands on her
              own board. Only on the head's reading: a designer is already
              the person she needs to be. */}
          {board.viewer.scope === "all" ? (
            <a
              href="/login?next=%2Fdesign-board"
              className="rounded bg-cream px-4 py-1.5 font-body text-[10px] font-bold uppercase tracking-[0.14em] text-espresso transition-colors hover:bg-white"
            >
              Sign in to edit
            </a>
          ) : null}
          <BoardAccount name={session.user.name} next="/design-board" />
        </div>
      </header>

      <main id="board" className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-8">
        {/* The same board the team works, from the same computation — so this
            page and the portal can never disagree about what is late. */}
        <DesignTrackerBoard
          initial={board}
          openTab={searchParams?.tab === "team" ? "team" : null}
        />

        <p className="mt-10 border-t border-line pt-4 font-body text-[11px] font-light text-muted">
          {board.can.edit ? (
            <>
              You are signed in as{" "}
              <span className="text-secondary">{session.user.name}</span> — what
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

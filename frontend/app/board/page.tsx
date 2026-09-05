import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { WioTrackerBoard } from "@/components/wio-tracker/WioTrackerBoard";
import { getPublicBoard } from "@/lib/services/wio-tracker";

export const dynamic = "force-dynamic";

/**
 * The board, open — no sign-in.
 *
 * Ruby, 2026-09-03: everyone at essentia should be able to open it; only the
 * WIO team should be able to change it. Portal accounts for the whole company
 * were never going to happen, and one shared password ends up in the same
 * place with extra steps and nobody able to say who looked.
 *
 * READ-ONLY IS NOT ENFORCED HERE, WHICH IS THE POINT. getPublicBoard reports
 * every capability as false so the client draws no controls — but the real
 * guarantee is that every write goes through /api/wio-tracker/*, each of which
 * calls requirePermission and refuses a request with no session. Someone who
 * opens this page cannot change the board even if they call those endpoints by
 * hand, because there is nothing here that could authorise them.
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

  const board = await getPublicBoard();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-espresso px-4 md:px-6">
        <Image src="/brand/logo-dark.png" alt="essentia" height={20} width={102} priority />
        <p className="font-body text-[10px] font-light uppercase tracking-[0.22em] text-cream/50">
          WIO → PIO Tracker · view only
        </p>
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-8">
        {/* The same board the team works, drawn from the same computation — so
            this page and the portal can never disagree about what is late. */}
        <WioTrackerBoard initial={board} />

        <p className="mt-10 border-t border-line pt-4 font-body text-[11px] font-light text-muted">
          This is a read-only view. To move a stage or log a delay, sign in at{" "}
          <a href="/login" className="underline decoration-line-strong underline-offset-2">
            the portal
          </a>
          .
        </p>
      </main>
    </div>
  );
}

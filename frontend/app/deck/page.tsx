import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { canEditDecks, listPublicDecks } from "@/lib/services/decks";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Concept decks · essentia",
  description: "The plan, the spaces and the renders, as one page.",
};

/**
 * The decks, for everybody — one link, the way /board is.
 *
 * Monica, 10 Sep 2026: "bilkul tracker jaisa". So this page adapts to whoever
 * opens it rather than asking them who they are first:
 *
 *   nobody signed in     →  read, and take a copy away
 *   signed in, viewer    →  the same, by name
 *   signed in, on the team →  the same, plus a pen
 *
 * WHAT DECIDES IS THE ACCOUNT, NOT THE URL. The list here is the same list the
 * portal shows, and the deck behind it opens in the same tool; the difference
 * is only that the tool arrives with nothing to save with. Every write goes
 * through /api/decks, which asks the design team's own list on every call, so
 * somebody who opens this page cannot change a deck even by calling those
 * endpoints directly.
 *
 * AND THIS IS DELIBERATELY OPEN. A deck carries a client's plan, their renders
 * and what their work is costed at, and a link can be forwarded. That was said
 * plainly and decided: the whole company should be able to see the work.
 */
export default async function PublicDecksPage() {
  const session = await getSession().catch(() => null);
  const canEdit = session ? await canEditDecks(session.user).catch(() => false) : false;

  /* This is a link people will have in their pocket. A database that is down,
     or an environment missing its connection string, should read as a sentence
     rather than as "Application error" — which tells the reader nothing and
     makes them ask whether they broke it. */
  const decks = await listPublicDecks().catch(() => null);
  if (!decks) {
    return (
      <main className="min-h-screen bg-canvas px-4 py-10 sm:px-8 md:px-12">
        <div className="mx-auto max-w-4xl">
          <Image src="/brand/logo-dark.png" alt="essentia" height={20} width={102} priority />
          <h1 className="mt-6 text-2xl font-light text-primary">Concept decks</h1>
          <p className="mt-3 text-sm leading-relaxed text-secondary">
            The decks cannot be reached at the moment. Nothing is lost — try
            again in a few minutes, or ask the design team for the file.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-10 sm:px-8 md:px-12">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Image
              src="/brand/logo-dark.png"
              alt="essentia"
              height={20}
              width={102}
              priority
            />
            <h1 className="mt-6 text-2xl font-light text-primary">
              Concept decks
            </h1>
            <p className="mt-2 text-sm font-light text-secondary">
              The plan, the spaces and the renders, as one page a client can read.
            </p>
          </div>

          {canEdit ? (
            <Link
              href="/decks"
              className="border border-line-strong px-3 py-2 text-xs uppercase tracking-[0.14em] text-primary hover:bg-hover"
            >
              Open the editor
            </Link>
          ) : (
            <Link
              href="/deck-login?next=/deck"
              className="border border-amber px-3 py-2 text-xs uppercase tracking-[0.14em] text-amber hover:bg-hover"
            >
              Sign in to edit
            </Link>
          )}
        </header>

        {decks.length === 0 ? (
          <p className="mt-10 text-sm text-muted">No decks yet.</p>
        ) : (
          <div className="mt-10 border border-line">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface text-left text-xs uppercase tracking-[0.12em] text-muted">
                  <th className="px-4 py-3 font-light">Project</th>
                  <th className="px-4 py-3 font-light">Code</th>
                  <th className="px-4 py-3 font-light">Spaces</th>
                  <th className="px-4 py-3 font-light">Last change</th>
                </tr>
              </thead>
              <tbody>
                {decks.map((deck) => (
                  <tr key={deck.id} className="border-t border-line hover:bg-hover">
                    <td className="px-4 py-3">
                      <Link
                        href={`/deck/${deck.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {deck.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-secondary">
                      {deck.projectCode ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-secondary">{deck.spaces}</td>
                    <td className="px-4 py-3 text-secondary">
                      {deck.updatedBy ?? "—"} · {whenWords(deck.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-8 text-xs leading-relaxed text-muted">
          Open a deck to read it, print it, or save it as a file to keep. Changing
          one is the design team&apos;s, and every change is kept against the
          account that made it.
        </p>
      </div>
    </main>
  );
}

function whenWords(iso: string): string {
  const d = new Date(iso);
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]} · ${String(
    d.getHours(),
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

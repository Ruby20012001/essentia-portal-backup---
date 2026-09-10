import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { canEditDecks, canReadDecks, listDecks } from "@/lib/services/decks";

export const dynamic = "force-dynamic";

/**
 * S? · Concept decks (Brief §29) — the design room's client-facing document.
 *
 * The named design team reads and changes; nobody else gets in. The tool is
 * the same single file it has always been, served from /tools/concept-deck.html
 * and pointed at a deck by its id — so what a designer works in here is what
 * they already know, and the deck it writes is the same file a client opens.
 */
export default async function DecksPage() {
  if (!process.env.DATABASE_URL) {
    return (
      <Frame>
        <p className="text-sm text-secondary">
          DATABASE_URL is not set — see frontend/.env.example.
        </p>
      </Frame>
    );
  }

  const user = await getCurrentUser();

  /* A deck is a client's plan and what their work is costed at. Being signed
     in to the portal is not the same as being on the job, so the door is the
     design team's own list — everybody else is told so plainly rather than
     shown an empty page they will ask about. */
  if (!(await canReadDecks(user))) {
    return (
      <Frame>
        <div className="border border-line bg-card px-5 py-6">
          <p className="text-sm text-primary">This is the design team&apos;s.</p>
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            Decks carry a client&apos;s plan, their renders and their figures, so
            they open only for the people working on them. If you need one, ask
            the design team to send it — a deck exports as a single file that
            opens anywhere.
          </p>
        </div>
      </Frame>
    );
  }

  const [decks, canEdit] = await Promise.all([
    listDecks(user),
    canEditDecks(user),
  ]);

  return (
    <Frame>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-light text-secondary">
          {decks.length === 0
            ? "No decks yet."
            : `${decks.length} deck${decks.length === 1 ? "" : "s"}. Newest work first.`}
        </p>
        {canEdit ? (
          <Link
            href="/tools/concept-deck.html?new=1"
            className="border border-line-strong px-3 py-2 text-xs uppercase tracking-[0.14em] text-primary hover:bg-hover"
          >
            New deck
          </Link>
        ) : (
          <span className="text-xs uppercase tracking-[0.14em] text-muted">
            View only
          </span>
        )}
      </div>

      {decks.length > 0 && (
        <div className="mt-6 border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface text-left text-xs uppercase tracking-[0.12em] text-muted">
                <th className="px-4 py-3 font-light">Project</th>
                <th className="px-4 py-3 font-light">Code</th>
                <th className="px-4 py-3 font-light">Stage</th>
                <th className="px-4 py-3 font-light">Spaces</th>
                <th className="px-4 py-3 font-light">Last change</th>
              </tr>
            </thead>
            <tbody>
              {decks.map((deck) => (
                <tr key={deck.id} className="border-t border-line hover:bg-hover">
                  <td className="px-4 py-3">
                    <Link
                      href={`/tools/concept-deck.html?deck=${deck.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {deck.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {deck.projectCode ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-secondary">{deck.stage}</td>
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

      <p className="mt-6 text-xs leading-relaxed text-muted">
        Who changed what is kept against the account that changed it, not a name
        typed into a box. Nothing here is deleted — a deck is archived, and the
        trail behind it stays.
      </p>
    </Frame>
  );
}

function whenWords(iso: string): string {
  const d = new Date(iso);
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]} · ${String(
    d.getHours(),
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-light text-primary">Concept decks</h1>
      <p className="mt-2 text-sm font-light text-secondary">
        The plan, the spaces and the renders, as one file a client can read.
      </p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

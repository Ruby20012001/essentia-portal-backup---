import { redirect } from "next/navigation";
import { Header } from "@/components/shell/Header";
import { Sidebar } from "@/components/shell/Sidebar";
import { getSession } from "@/lib/auth/session";
import { portalMode } from "@/lib/portal-mode";
import { isDesignManager, listDesignTeamForNav } from "@/lib/services/design-tracker";
import { listDecks } from "@/lib/services/decks";

/**
 * Every portal page requires a session. This server-side check is the real
 * enforcement (middleware only does the Edge cookie-presence gate); an
 * expired, revoked, or idle session resolves to null here and redirects.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  /* Concept decks is offered to whoever runs the design board, and to nobody
     else (Monica, 18 Sep). Asked only on the design deployment: in full mode
     the entry belongs to everybody, and the question would be a database round
     trip added to every page render for an answer that is always yes. */
  const canSeeDecks =
    portalMode() === "tracker" ? await isDesignManager(session.user) : true;

  /* The decks go under the entry in the nav, one per line. Fetched only for
     somebody who is offered them at all, and only on this deployment — and a
     failure is a shorter menu, never a page that will not load. */
  const decks = canSeeDecks && portalMode() === "tracker"
    ? await listDecks(session.user)
        .then((rows) =>
          rows
            .map((d) => ({ id: d.id, name: d.name }))
            /* By name, not by when it was last touched. listDecks answers
               newest-first, which is right for the decks page and wrong for a
               menu: the order would rearrange itself every time somebody saved,
               and a menu you have to re-read is worse than a long one. */
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
        .catch(() => [])
    : [];

  /* The design team under the tracker, the way the decks sit under theirs.
     Head only, and only on this deployment — same reasons as the decks above. */
  const team = portalMode() === "tracker" ? await listDesignTeamForNav(session.user) : [];

  return (
    <div className="flex h-screen flex-col">
      <Header user={session.user} canSeeDecks={canSeeDecks} decks={decks} team={team} />
      <div className="flex min-h-0 flex-1">
        <Sidebar canSeeDecks={canSeeDecks} decks={decks} team={team} />
        <main className="min-w-0 flex-1 overflow-y-auto bg-canvas px-4 py-6 sm:px-6 md:px-10 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

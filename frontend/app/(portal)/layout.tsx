import { redirect } from "next/navigation";
import { Header } from "@/components/shell/Header";
import { Sidebar } from "@/components/shell/Sidebar";
import { getSession } from "@/lib/auth/session";
import { portalMode } from "@/lib/portal-mode";
import { isDesignManager } from "@/lib/services/design-tracker";

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

  /* Neither the decks nor the design team are fetched for the menu any more
     (Monica, 25 Sep: "sirf Vishakha ka"). The entries are still there; what
     the menu stopped doing is naming four other people's work down the side
     of hers, which is also two queries this layout no longer makes. */

  return (
    <div className="flex h-screen flex-col">
      <Header user={session.user} canSeeDecks={canSeeDecks} />
      <div className="flex min-h-0 flex-1">
        <Sidebar canSeeDecks={canSeeDecks} />
        <main className="min-w-0 flex-1 overflow-y-auto bg-canvas px-4 py-6 sm:px-6 md:px-10 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { Header } from "@/components/shell/Header";
import { Sidebar } from "@/components/shell/Sidebar";
import { getSession } from "@/lib/auth/session";

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

  return (
    <div className="flex h-screen flex-col">
      <Header user={session.user} />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto bg-canvas px-4 py-6 sm:px-6 md:px-10 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

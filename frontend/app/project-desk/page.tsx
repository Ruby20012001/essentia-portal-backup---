import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bodoni_Moda, Figtree } from "next/font/google";
import { getSession } from "@/lib/auth/session";
import { listDeskProjects } from "@/lib/services/project-desk";
import { ProjectDesk } from "@/components/project-desk/ProjectDesk";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Project Desk · essentia",
  robots: { index: false, follow: false },
};

// The desk's own type, scoped to this page: Bodoni Moda for headings, Figtree
// for everything else. The rest of the portal stays on Lato.
// adjustFontFallback off: Next has no fallback metrics for Bodoni Moda and
// logs an error for every build without it.
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--pd-serif",
  adjustFontFallback: false,
});
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--pd-sans" });

/**
 * Project Desk — every live project from enquiry to handover, on one page,
 * with an assistant that reads it.
 *
 * Signed in first, with the portal's own sign-in: everybody on the team may
 * read and change every project, and every change is stamped with who made it.
 */
export default async function ProjectDeskPage() {
  const session = await getSession().catch(() => null);
  if (!session) redirect("/login?next=%2Fproject-desk");

  const projects = await listDeskProjects();

  return (
    <div className={`${bodoni.variable} ${figtree.variable}`}>
      <ProjectDesk initial={projects} userName={session.user.name} />
    </div>
  );
}

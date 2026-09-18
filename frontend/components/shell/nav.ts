import { isRouteAllowed, portalMode, type PortalMode } from "@/lib/portal-mode";

/**
 * Portal navigation — the 18-screen information architecture from the
 * Digital Transformation Blueprint (§04), grouped by domain. Role-first:
 * every role lands on its own dashboard and drills from a priority signal;
 * role-based filtering of this list arrives with the auth module.
 */
export type NavItem = { label: string; href: string; screen: string };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", screen: "S2" },
      { label: "Project Hub", href: "/projects", screen: "S25" },
      { label: "My Approvals", href: "/approvals", screen: "S4b" },
      { label: "Notifications", href: "/notifications", screen: "S23" },
      { label: "Workflows", href: "/workflows", screen: "S19" },
      { label: "COO Operations", href: "/coo", screen: "S8" },
      { label: "Founder Morning Brief", href: "/founder-brief", screen: "S18" },
    ],
  },
  {
    label: "Delivery",
    items: [
      { label: "Design Room", href: "/design-room", screen: "S5" },
      { label: "WIO / PIO Hub", href: "/wio-pio", screen: "S4" },
      // S4b sits beside S4, not inside it: same §30 window, different cut.
      // The Hub runs the department conversion checklist; the Tracker walks
      // the stage chain and answers who is holding what.
      { label: "WIO → PIO Tracker", href: "/wio-tracker", screen: "S4b" },
      // The same shape on the design activity chart — Vishakha's team.
      { label: "Design Activity Tracker", href: "/design-tracker", screen: "S4c" },
      // The client-facing document, beside the work it describes. Who may
      // open it is decided by the page, against the design team's own list.
      { label: "Concept decks", href: "/decks", screen: "S5b" },
      { label: "VisionCAM", href: "/visioncam", screen: "S3" },
      { label: "Production Facility — NH8", href: "/factory", screen: "S10" },
    ],
  },
  {
    label: "Commercial",
    items: [
      { label: "BD Pipeline", href: "/bd-pipeline", screen: "S7" },
      { label: "Procurement", href: "/procurement", screen: "S9" },
      { label: "essentia home", href: "/eh", screen: "S6" },
    ],
  },
  {
    label: "Relationships",
    items: [
      { label: "Communication Spine", href: "/communication", screen: "S17" },
      { label: "Client Portal", href: "/client", screen: "S15" },
      { label: "Vendor Portal", href: "/vendor", screen: "S14" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Knowledge Library", href: "/knowledge", screen: "S16" },
      { label: "Workflow Definitions", href: "/workflow-definitions", screen: "S20" },
      { label: "Active Delegations", href: "/workflow-delegations", screen: "S21" },
      { label: "SLA Monitor", href: "/sla-monitor", screen: "S22" },
      { label: "API Health", href: "/api-health", screen: "S13" },
    ],
  },
  {
    label: "People",
    items: [
      // One entry, not two: hiring IS the HR screen now, and the Keka sync it
      // was a placeholder for is a source of people rather than a screen.
      { label: "Hiring", href: "/hr", screen: "S11" },
      { label: "Exit Protocol", href: "/exit-protocol", screen: "S12" },
    ],
  },
];

/**
 * The nav for this deployment. Groups that end up empty are dropped, so tracker
 * mode shows one "Delivery" group with one entry rather than six headings over
 * nothing.
 *
 * Deliberately here rather than in lib/portal-mode.ts: that module is imported
 * by middleware.ts, which Vercel bundles for the Edge runtime, and pulling this
 * file's constant in there made the Edge bundle unresolvable.
 */
export function visibleNav(mode: PortalMode = portalMode()): NavGroup[] {
  if (mode === "full") return NAV;
  return NAV.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => isRouteAllowed(item.href, mode))
      // On the design deployment the tracker IS the whole portal, so the one
      // entry behind the ☰ is read as "the dashboard", not as one tracker
      // among several (Monica, 18 Sep: "3 lines me to dashboard likha ho").
      // Only here: in full mode /dashboard already owns that word.
      .map((item) =>
        item.href === "/design-tracker" ? { ...item, label: "Dashboard" } : item,
      ),
  })).filter((group) => group.items.length > 0);
}

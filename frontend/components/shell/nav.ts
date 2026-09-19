import { isRouteAllowed, portalMode, type PortalMode } from "@/lib/portal-mode";

/**
 * Portal navigation — the 18-screen information architecture from the
 * Digital Transformation Blueprint (§04), grouped by domain. Role-first:
 * every role lands on its own dashboard and drills from a priority signal;
 * role-based filtering of this list arrives with the auth module.
 */
export type NavItem = {
  label: string;
  href: string;
  screen: string;
  /** Listed under the entry, indented — see NavGroups. */
  children?: { label: string; href: string }[];
};
export type NavGroup = { label: string; items: NavItem[] };

/**
 * "Lavika — concept deck" is "Lavika" in a 256px column.
 *
 * The decks are named for whoever keeps them, and in the sidebar the words
 * after the dash are the same on every line — so they cost width and say
 * nothing. The full name stays on the /decks page, and on the deck itself.
 */
function deckShortName(name: string): string {
  const cut = name.split(/\s+[—–-]\s+/)[0]?.trim();
  return cut && cut.length > 1 ? cut : name;
}

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
/**
 * @param canSeeDecks Whether this viewer gets the Concept decks entry. Only
 *   whoever runs the design board does — Vishakha (Monica, 18 Sep: "tracker ka
 *   access sirf Vishakha ke paas hai edit ka, to wo enter kregi to concept deck
 *   bhi unhe show ho ske"). This hides the ENTRY, not the decks: the four
 *   designers are on ee.concept_deck_editors and go on making decks through
 *   /deck-login exactly as before. Taking the feature away from them would be
 *   a different change, and would stop work that is running today.
 */
export function visibleNav(
  mode: PortalMode = portalMode(),
  canSeeDecks = true,
  decks: { id: string; name: string }[] = [],
): NavGroup[] {
  if (mode === "full") return NAV;
  return NAV.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => isRouteAllowed(item.href, mode))
      .filter((item) => item.href !== "/decks" || canSeeDecks)
      /* The decks themselves, under the entry that leads to them (Monica,
         18 Sep: "ek ke neeche ek — Lavika, Ritu, aise"). One per designer, so
         the board she opens every morning is also the way into each of them,
         without a list page in between. Read from the decks that exist rather
         than a written-out list of names: a deck renamed, added or archived
         then shows here on its own. */
      .map((item) =>
        item.href === "/decks" && decks.length > 0
          ? {
              ...item,
              children: decks.map((d) => ({
                label: deckShortName(d.name),
                href: `/deck/${d.id}`,
              })),
            }
          : item,
      )
      // The WIO → PIO Tracker is not the design team's board and does not
      // belong in their menu (Monica, 18 Sep: "mere link me wio tracker nhi
      // ana chahiye"). Hidden from the nav only — /wio-tracker stays a live
      // route, so anybody holding the link, and /board, are untouched.
      .filter((item) => item.href !== "/wio-tracker")
      // On the design deployment the tracker IS the whole portal, so the one
      // entry behind the ☰ is read as "the dashboard", not as one tracker
      // among several (Monica, 18 Sep: "3 lines me to dashboard likha ho").
      // Only here: in full mode /dashboard already owns that word.
      .map((item) =>
        item.href === "/design-tracker"
          ? { ...item, label: "Dashboard" }
          : item,
      ),
  })).filter((group) => group.items.length > 0);
}

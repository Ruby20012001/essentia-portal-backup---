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
      { label: "My Approvals", href: "/approvals", screen: "S4b" },
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
      { label: "VisionCAM", href: "/visioncam", screen: "S3" },
      { label: "Factory — NH8", href: "/factory", screen: "S10" },
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
      { label: "API Health", href: "/api-health", screen: "S13" },
    ],
  },
  {
    label: "People",
    items: [
      { label: "HR & Keka", href: "/hr", screen: "S11" },
      { label: "Exit Protocol", href: "/exit-protocol", screen: "S12" },
    ],
  },
];

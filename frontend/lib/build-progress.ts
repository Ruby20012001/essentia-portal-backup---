import { NAV } from "@/components/shell/nav";

/**
 * Build Progress — how far the portal itself has come: every screen in the
 * menu, and the eight Velocity Gates that must be live before the first
 * client goes on the portal (Brief §35).
 *
 * Screens: `tests/unit/build-progress.test.ts` reads each page file and fails
 * if this list calls a PagePlaceholder page built, or the reverse, or if a
 * menu entry is missing here. So this half cannot quietly go stale.
 *
 * Gates: a gate is a business fact ("every site visit creates a photo
 * record"), not something code can prove. Their status is as recorded in
 * docs/PROJECT_MEMORY.md and TODO.md, and the page says so.
 */

export type ScreenStatus = "built" | "placeholder";

type ScreenNote = { status: ScreenStatus; note?: string };

export const SCREENS: Record<string, ScreenNote> = {
  "/dashboard": { status: "built" },
  "/projects": { status: "built" },
  "/approvals": { status: "built" },
  "/notifications": { status: "built" },
  "/workflows": { status: "built" },
  "/coo": { status: "built", note: "Read-only. EH stock waits on Zakya." },
  "/founder-brief": { status: "built", note: "People alerts wait on Keka." },
  "/design-room": { status: "built" },
  "/wio-pio": { status: "built" },
  "/wio-tracker": { status: "built" },
  "/design-tracker": { status: "built" },
  "/decks": { status: "built" },
  "/visioncam": { status: "built", note: "Web log only. Mobile capture not built." },
  "/factory": { status: "built", note: "Read-only. Needs stations assigned and daily manpower entered." },
  "/bd-pipeline": { status: "placeholder", note: "Waits on HubSpot." },
  "/procurement": { status: "built", note: "Read-only. Raising VRNs and WOs not built; TranZact not wired." },
  "/eh": { status: "built" },
  "/communication": { status: "built" },
  "/client": { status: "placeholder", note: "Phase 3. Needs client sign-in (Twilio OTP)." },
  "/vendor": { status: "placeholder", note: "Needs vendor sign-in (Twilio OTP)." },
  "/knowledge": { status: "built", note: "Word search. Search by meaning waits on an embedding service." },
  "/workflow-definitions": { status: "built" },
  "/workflow-delegations": { status: "built" },
  "/sla-monitor": { status: "built" },
  "/api-health": { status: "built", note: "The 5-minute check probes Anthropic only; the other ten have no connection to test." },
  "/hr": { status: "built", note: "Hiring is built. Keka sync is not." },
  "/exit-protocol": { status: "built", note: "Graph, WhatsApp and telephony removals are recorded as not wired." },
  "/build-progress": { status: "built" },
};

export type GateStatus = "passed" | "open";

export const GATES: { n: number; name: string; rule: string; status: GateStatus; note?: string }[] = [
  {
    n: 1,
    name: "VisionCAM billing live",
    rule: "Every site visit creates a photo record; every contractor bill comes from VisionCAM evidence.",
    status: "open",
  },
  {
    n: 2,
    name: "Weekly Pulse automated",
    rule: "Every Friday, every active project gets a drafted 3-line update the CRM TL reviews and sends.",
    status: "passed",
  },
  {
    n: 3,
    name: "WIO clock running",
    rule: "Every department WIO has a visible 15-day countdown; none can lapse silently.",
    status: "passed",
  },
  {
    n: 4,
    name: "VRN revocation automated",
    rule: "The day a vendor or staff member exits, their access is revoked without an IT request.",
    status: "passed",
    note: "Teams, WhatsApp and phone removals are still recorded as not wired.",
  },
  {
    n: 5,
    name: "EH discount control enforced",
    rule: "No discount reaches a family before the Country Head approves it in the portal.",
    status: "passed",
  },
  {
    n: 6,
    name: "Founder Morning Brief at 6:30am",
    rule: "The group's health in seven minutes, auto-generated every morning.",
    status: "passed",
  },
  {
    n: 7,
    name: "Succession pack auto-generates",
    rule: "When an exit date is confirmed, the successor's briefing arrives before the exit conversation ends.",
    status: "passed",
  },
  {
    n: 8,
    name: "Communication Spine live",
    rule: "Every new client gets the Welcome Letter within 4 hours, and a Weekly Pulse every Friday.",
    status: "open",
  },
];

export type ProgressGroup = {
  label: string;
  screens: { label: string; href: string; screen: string; status: ScreenStatus; note?: string }[];
};

/** The menu, in menu order, with each screen's status. An entry missing from SCREENS reads as a placeholder. */
export function progressByGroup(): ProgressGroup[] {
  return NAV.map((g) => ({
    label: g.label,
    screens: g.items.map((i) => ({
      label: i.label,
      href: i.href,
      screen: i.screen,
      status: SCREENS[i.href]?.status ?? "placeholder",
      note: SCREENS[i.href]?.note,
    })),
  }));
}

export function progressTotals(groups: ProgressGroup[]) {
  const all = groups.flatMap((g) => g.screens);
  const built = all.filter((s) => s.status === "built").length;
  const gatesPassed = GATES.filter((g) => g.status === "passed").length;
  return {
    built,
    total: all.length,
    pct: all.length ? Math.round((built / all.length) * 100) : 0,
    gatesPassed,
    gatesTotal: GATES.length,
  };
}

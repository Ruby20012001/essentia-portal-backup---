/**
 * Project Desk — the rules, with no database and no React. Shared by the
 * server (the API, the assistant's data) and the page, so the two can never
 * disagree about what is late or how far along a site is.
 */

export const STAGES = ["Enquiry", "Proposal sent", "Design", "Execution", "Handover"] as const;
export type Stage = (typeof STAGES)[number];

export const TYPES = [
  "Residence",
  "Apartment",
  "Clubhouse",
  "Office",
  "Retail",
  "Hospitality",
  "Other",
] as const;
export type ProjectType = (typeof TYPES)[number];

/** The eleven site steps, in the order they happen. `key` is what is stored. */
export const SITE_STEPS = [
  { key: "measurement", label: "Site measurement" },
  { key: "civil", label: "Civil and masonry" },
  { key: "electrical", label: "Electrical and plumbing" },
  { key: "ac_ceiling", label: "AC and false ceiling" },
  { key: "flooring", label: "Flooring and stone" },
  { key: "joinery", label: "Wall panelling and joinery" },
  { key: "paint", label: "Paint and polish" },
  { key: "lights", label: "Lights and fittings" },
  { key: "furniture", label: "Furniture delivery" },
  { key: "soft", label: "Soft furnishings and art" },
  { key: "snagging", label: "Snagging and handover" },
] as const;
export type SiteStepKey = (typeof SITE_STEPS)[number]["key"];

const STEP_KEYS = new Set<string>(SITE_STEPS.map((s) => s.key));

export type DeskProject = {
  id: number;
  name: string;
  client: string | null;
  city: string | null;
  type: ProjectType;
  stage: Stage;
  owner: string | null;
  next_step: string | null;
  /** YYYY-MM-DD */
  due_date: string | null;
  site_work: SiteStepKey[];
  updated_at: string;
  updated_by: string | null;
};

/** Site work only means something once there is a site. */
export function hasSiteWork(stage: Stage): boolean {
  return stage === "Execution" || stage === "Handover";
}

/** Only known keys, each once, in the order of the steps. */
export function cleanSiteWork(value: unknown): SiteStepKey[] {
  const given = new Set(Array.isArray(value) ? value.filter((v) => typeof v === "string") : []);
  return SITE_STEPS.map((s) => s.key).filter((k) => given.has(k) && STEP_KEYS.has(k));
}

export function siteProgressPct(done: readonly string[]): number {
  return Math.round((cleanSiteWork(done).length / SITE_STEPS.length) * 100);
}

/** Today's date in India, as YYYY-MM-DD — every date on the desk is IST. */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Late: the next step's date has passed, and the project is not handed over. */
export function isLate(p: Pick<DeskProject, "due_date" | "stage">, today = todayIST()): boolean {
  return !!p.due_date && p.due_date < today && p.stage !== "Handover";
}

/** A YYYY-MM-DD date moved by whole days. Done in UTC so no clock change can shift it. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Due this week: today or one of the next six days, and not handed over.
 * Never overlaps with late — a date that has passed is late, not due.
 */
export function isDueThisWeek(
  p: Pick<DeskProject, "due_date" | "stage">,
  today = todayIST(),
): boolean {
  return (
    !!p.due_date && p.due_date >= today && p.due_date <= addDays(today, 6) && p.stage !== "Handover"
  );
}

/** Every word typed must appear somewhere in the name, client, city or owner. */
export function matchesSearch(
  p: Pick<DeskProject, "name" | "client" | "city" | "owner">,
  query: string,
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [p.name, p.client, p.city, p.owner].filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Soonest due first; projects with no date go to the bottom. */
export function sortByDue<T extends Pick<DeskProject, "due_date" | "name">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.due_date === b.due_date) return a.name.localeCompare(b.name);
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  });
}

/** What the assistant is given: each project, plus the things it would otherwise have to work out. */
export function forAssistant(rows: DeskProject[], today = todayIST()) {
  return sortByDue(rows).map((p) => {
    const base = {
      name: p.name,
      client: p.client,
      city: p.city,
      type: p.type,
      stage: p.stage,
      owner: p.owner,
      next_step: p.next_step,
      due_date: p.due_date,
      late: isLate(p, today),
      updated_at: p.updated_at,
      updated_by: p.updated_by,
    };
    if (!hasSiteWork(p.stage)) return base;
    const done = new Set<string>(p.site_work);
    return {
      ...base,
      site_progress_pct: siteProgressPct(p.site_work),
      site_work_done: SITE_STEPS.filter((s) => done.has(s.key)).map((s) => s.label),
      site_work_pending: SITE_STEPS.filter((s) => !done.has(s.key)).map((s) => s.label),
    };
  });
}

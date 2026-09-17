/**
 * Hiring — the rules that need no database (S11 · Brief §32, §36).
 *
 * PURE: no database, no clock, no environment. Everything here is a decision
 * the service makes and the screen has to make the same way — which question
 * set a round gets, which stage a new round defaults to, whether a round has
 * happened, whether a decision is allowed from where a candidate stands.
 *
 * It lives apart from hiring.ts for the reason wio-tracker-logic.ts does: a
 * rule written twice, once in SQL and once in a component, drifts. The
 * question-set preview on the schedule form and the set the server actually
 * attaches are the same function, so they cannot disagree about which set
 * "Choose for me" means.
 *
 * Every rule is pinned in tests/unit/hiring-logic.test.ts.
 */

/* ── the shapes the rules read ─────────────────────────────────────────── */

export type CandidateStatus = "active" | "offered" | "hired" | "rejected" | "withdrawn";
export type RoundStatus = "scheduled" | "done" | "cancelled" | "no_show";
export type EmploymentType = "full_time" | "contract" | "intern";

export const EMPLOYMENT_TYPES: readonly EmploymentType[] = ["full_time", "contract", "intern"];

export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  full_time: "Full-time",
  contract: "Contract",
  intern: "Intern",
};

export type StageLike = { code: string; label: string; seq: number; isFinal: boolean };

export type SetLike = {
  id: string;
  name: string;
  roleId: string | null;
  stageCode: string | null;
  isActive: boolean;
  /** ISO; newer wins inside a tier. */
  createdAt: string;
};

/* ── which question set a round gets ───────────────────────────────────── */

/**
 * The most specific active set wins:
 *
 *   1. written for this seat AND this stage
 *   2. written for this stage, any seat
 *   3. written for this seat, any stage
 *   4. a general set — any seat, any stage
 *
 * Stage outranks seat. A department round asks craft questions whichever seat
 * it is for; a seat-wide set is a fallback for the stages nobody has written
 * questions for yet, and must not silently replace a stage's own questions.
 * Inside a tier the newest set wins, so writing a corrected set takes effect
 * without having to retire the old one first (though retiring it is cleaner).
 */
export function questionSetTier(
  set: Pick<SetLike, "roleId" | "stageCode">,
  roleId: string | null,
  stageCode: string,
): number | null {
  const seatFits = set.roleId === null || set.roleId === roleId;
  const stageFits = set.stageCode === null || set.stageCode === stageCode;
  if (!seatFits || !stageFits) return null;
  if (set.roleId !== null && set.stageCode !== null) return 1;
  if (set.stageCode !== null) return 2;
  if (set.roleId !== null) return 3;
  return 4;
}

export function setFits(
  set: Pick<SetLike, "roleId" | "stageCode" | "isActive">,
  roleId: string | null,
  stageCode: string,
): boolean {
  return set.isActive && questionSetTier(set, roleId, stageCode) !== null;
}

export function pickQuestionSet<T extends SetLike>(
  sets: readonly T[],
  roleId: string | null,
  stageCode: string,
): T | null {
  let best: { set: T; tier: number } | null = null;
  for (const set of sets) {
    if (!set.isActive) continue;
    const tier = questionSetTier(set, roleId, stageCode);
    if (tier === null) continue;
    if (
      !best ||
      tier < best.tier ||
      (tier === best.tier && set.createdAt > best.set.createdAt)
    ) {
      best = { set, tier };
    }
  }
  return best?.set ?? null;
}

/* ── which stage a new round is for ────────────────────────────────────── */

/**
 * A round is almost always for the NEXT conversation, not the one the
 * candidate is already at. Defaulting the form to the current stage filed
 * every first call as "Applied" — a stage that means "not yet spoken to" —
 * and then attached the wrong questions to it.
 *
 * The next stage after where they are, skipping the final stage (an offer is
 * not a round). If there is nothing after, the current stage.
 */
export function defaultRoundStage(stages: readonly StageLike[], current: string): string {
  const ordered = [...stages].sort((a, b) => a.seq - b.seq);
  const here = ordered.find((s) => s.code === current);
  const next = ordered.find((s) => !s.isFinal && (!here || s.seq > here.seq));
  if (next) return next.code;
  const lastRound = [...ordered].reverse().find((s) => !s.isFinal);
  return lastRound?.code ?? current;
}

/* ── has a round happened ──────────────────────────────────────────────── */

/**
 * A round has happened when somebody said so, or when it was scheduled and
 * its end time has passed without anybody calling it off.
 *
 * The second half matters. Waiting for somebody to click "Held" before the
 * owed-feedback rule applies meant the rule never applied: a round nobody
 * marked stayed "scheduled" for ever, and the candidate could be moved on
 * without a word from the people who met them. A round that did not take
 * place is recorded as called off or no-show — which is a fact worth having.
 */
export function roundHasHappened(
  round: { status: RoundStatus; scheduledAt: string; durationMins: number },
  nowMs: number,
): boolean {
  if (round.status === "done") return true;
  if (round.status !== "scheduled") return false;
  const end = new Date(round.scheduledAt).getTime() + round.durationMins * 60_000;
  return Number.isFinite(end) && end <= nowMs;
}

/** A scorecard may be submitted once the round has started, and never for one that did not take place. */
export function scorecardSubmitRefusal(
  round: { status: RoundStatus; scheduledAt: string },
  nowMs: number,
): string | null {
  if (round.status === "cancelled") {
    return "This round was called off, so there is nothing to write up.";
  }
  if (round.status === "no_show") {
    return "The candidate did not come to this round, so there is nothing to write up.";
  }
  const starts = new Date(round.scheduledAt).getTime();
  if (Number.isFinite(starts) && starts > nowMs) {
    return (
      "This round has not started yet. Save a draft to prepare — you can " +
      "submit once the conversation has happened."
    );
  }
  return null;
}

/* ── where a candidate may go from here ────────────────────────────────── */

const STILL_MOVING: ReadonlySet<CandidateStatus> = new Set(["active", "offered"]);

export function isStillMoving(status: CandidateStatus): boolean {
  return STILL_MOVING.has(status);
}

/**
 * The decisions a person can make on a candidate, and the one sentence that
 * explains a refusal. `active` as a target is reopening somebody who stopped.
 *
 * `offered` is not decided here: an offer IS the final stage, and moving there
 * sets it (see the service). Two buttons that meant almost the same thing were
 * how a candidate ended up "at Offer" with no offer on record.
 */
export function decisionRefusal(
  name: string,
  from: CandidateStatus,
  to: CandidateStatus,
): string | null {
  if (from === to) return `${name} is already ${to}.`;
  if (to === "active") {
    return isStillMoving(from)
      ? `${name} is still moving through the pipeline — there is nothing to reopen.`
      : null;
  }
  if (to === "offered") {
    return "An offer is made by moving the candidate to the Offer stage.";
  }
  if (!isStillMoving(from)) {
    return (
      `${name} is ${from} and is not moving through the pipeline. ` +
      `Reopen them first if this is a mistake.`
    );
  }
  return null;
}

/** A reason is required to stop somebody, and to bring them back. */
export function decisionNeedsNote(to: CandidateStatus): boolean {
  return to === "rejected" || to === "withdrawn" || to === "active";
}

/* ── the seat ──────────────────────────────────────────────────────────── */

export type SeatLike = {
  title: string;
  status: "open" | "on_hold" | "filled" | "closed";
  headcount: number;
  hired: number;
};

/** Moves, offers and hires happen on a seat that is open or on hold. */
export function seatRefusal(seat: SeatLike, action: "move" | "hire"): string | null {
  if (seat.status === "closed" || seat.status === "filled") {
    return (
      `"${seat.title}" is ${seat.status}. Reopen the seat before ` +
      `${action === "hire" ? "hiring anybody into it" : "moving anybody on"}.`
    );
  }
  if (action === "hire" && seat.hired >= seat.headcount) {
    return (
      `"${seat.title}" is for ${seat.headcount} ` +
      `${seat.headcount === 1 ? "person" : "people"} and ${seat.hired} ` +
      `${seat.hired === 1 ? "is" : "are"} already hired. Raise the headcount on the seat first ` +
      `if this hire is meant to be additional.`
    );
  }
  return null;
}

/** Seats still to fill across the open seats — headcount less the people already hired. */
export function seatsToFill(seats: readonly Pick<SeatLike, "status" | "headcount" | "hired">[]): number {
  return seats
    .filter((s) => s.status === "open")
    .reduce((n, s) => n + Math.max(0, s.headcount - s.hired), 0);
}

/* ── what people type ──────────────────────────────────────────────────── */

export const LIMITS = {
  roleTitle: 200,
  roleLocation: 120,
  candidateName: 200,
  email: 255,
  phone: 30,
  source: 60,
  setName: 160,
  roundLocation: 200,
} as const;

/** The first field that is too long, as a sentence naming it. */
export function lengthRefusal(
  fields: readonly { label: string; value: string | null | undefined; max: number }[],
): string | null {
  for (const f of fields) {
    if (f.value != null && f.value.length > f.max) {
      return `${f.label} is limited to ${f.max} characters (this one is ${f.value.length}).`;
    }
  }
  return null;
}

const MIN_PLAUSIBLE_CTC = 10_000;
const MAX_CTC = 9_999_999_999;

/**
 * Salary figures in rupees a year. The form takes lakhs, because that is how
 * everybody here says a salary; this catches the figure that was typed in the
 * wrong unit anyway ("5" meaning five lakh reads as ₹5 a year).
 */
export function ctcRefusal(label: string, value: number | null | undefined): string | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) return `${label} has to be a positive amount.`;
  if (value > MAX_CTC) return `${label} is more than the portal can store.`;
  if (value < MIN_PLAUSIBLE_CTC) {
    return (
      `${label} reads as ₹${value} a year. Enter it in lakhs — 5.4 for ₹5.4 lakh.`
    );
  }
  return null;
}

/** Lakhs, as typed, to whole rupees. Empty stays empty. */
export function lakhsToRupees(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n * 100_000) : Number.NaN;
}

export function rupeesToLakhs(rupees: number | null): string {
  if (rupees == null) return "";
  return String(Math.round((rupees / 100_000) * 100) / 100);
}

/**
 * A CV link that will actually open. Typed without a scheme, the browser
 * resolves it relative to the portal page and "Open the CV" lands on a 404.
 */
export function normalizeLink(raw: string | null | undefined):
  | { ok: true; value: string | null }
  | { ok: false; reason: string } {
  const text = (raw ?? "").trim();
  if (!text) return { ok: true, value: null };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { ok: false, reason: "The CV link has to be a web address (https://…)." };
    }
    if (!url.hostname.includes(".")) {
      return { ok: false, reason: "That CV link does not look like a web address." };
    }
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, reason: "That CV link does not look like a web address." };
  }
}

/** The last ten digits — enough to recognise the same Indian number however it was typed. */
export function phoneKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

/* ── time, in the zone the company works in ────────────────────────────── */

/**
 * A `datetime-local` value ("2026-09-18T11:30") read as India time.
 *
 * `new Date("2026-09-18T11:30")` reads it in the browser's own zone, so a
 * laptop left on UTC stored a different instant from the one typed and every
 * panel member saw the wrong hour. The zone is stated, not guessed.
 */
export function istLocalToIso(local: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(local.trim());
  if (!m) return null;
  const at = new Date(`${m[1]}T${m[2]}:00+05:30`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** The reverse, to prefill an edit form. */
export function isoToIstLocal(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const shifted = new Date(at.getTime() + 330 * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/* ── words ─────────────────────────────────────────────────────────────── */

export type RoundMode = "in_person" | "video" | "phone";

export const MODE_LABEL: Record<RoundMode, string> = {
  in_person: "in person",
  video: "video",
  phone: "phone",
};

export function modeLabel(mode: RoundMode): string {
  return MODE_LABEL[mode] ?? mode;
}

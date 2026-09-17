import { query, withUserContext } from "@/lib/db";
import {
  BlockingRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/services/blocking";
import { can, PermissionError } from "@/lib/services/permissions";
import { writeAudit } from "@/lib/services/audit";
import { searchColleagues } from "@/lib/services/users";
import { publishEvent } from "@/lib/notifications";
import { formatIST } from "@/lib/format";
import {
  EMPLOYMENT_TYPES,
  LIMITS,
  ctcRefusal,
  decisionNeedsNote,
  decisionRefusal,
  isStillMoving,
  lengthRefusal,
  modeLabel,
  normalizeLink,
  phoneKey,
  pickQuestionSet as pickFromSets,
  roundHasHappened,
  scorecardSubmitRefusal,
  seatRefusal,
  setFits,
  type CandidateStatus,
  type EmploymentType,
  type RoundStatus,
} from "@/lib/services/hiring-logic";
import type { SessionUser } from "@/lib/auth/session";

export type { CandidateStatus, EmploymentType } from "@/lib/services/hiring-logic";

/**
 * Hiring and interviews — S11 · People (Brief §32, §36).
 *
 * Hiring has lived in a WhatsApp group and an inbox. The cost of that is not
 * admin: it is that a candidate is asked the same question by four people and
 * the one thing nobody asked is the thing that mattered. This module holds the
 * open seats, the people against them, the rounds, the questions each round
 * asks, and what each interviewer thought.
 *
 * Five rules this file exists to keep.
 *
 *   · Nothing deletes. A candidate is rejected or withdrawn, never removed, and
 *     can be reopened with a reason. The trail is append-only.
 *
 *   · A panel member is not HR. A department HOD sitting on a round sees that
 *     round and the person they are about to meet — not the board, not the
 *     other candidates, and not what anybody is being paid. Postgres fences
 *     the rows (db/049); the money columns are fenced HERE, by never selecting
 *     them for a reader without hr_access.
 *
 *   · You write your own feedback, once the conversation has happened, and a
 *     submitted scorecard is never edited.
 *
 *   · Nobody is moved on, offered or hired while somebody who met them has
 *     not written it up. A round counts as having happened when it was marked
 *     held OR when its time has passed without being called off — waiting for
 *     somebody to click "Held" meant the rule never fired.
 *
 *   · The seat is real. A hire is refused past headcount or on a closed seat,
 *     and the hire that fills the last place marks the seat filled.
 *
 * CONNECTION DISCIPLINE. Nothing that uses `query()` — permissions, audit,
 * notifications — is ever called inside a `withUserContext` callback. Locally
 * the pool has one connection, and a nested checkout waits for itself forever.
 * Checks run before the transaction; audit and notifications after it commits.
 */

/* ── what the module is made of ────────────────────────────────────────── */

export type Stage = {
  code: string;
  label: string;
  seq: number;
  isFinal: boolean;
  description: string | null;
};

export type RoleStatus = "open" | "on_hold" | "filled" | "closed";

export type OpenRole = {
  id: string;
  title: string;
  departmentId: string | null;
  department: string | null;
  headcount: number;
  location: string | null;
  employment: EmploymentType;
  status: RoleStatus;
  hiringLeadId: string | null;
  hiringLead: string | null;
  notes: string | null;
  openedAt: string;
  active: number; // candidates still moving
  hired: number;
  stopped: number; // rejected or withdrawn
};

export type CandidateSummary = {
  id: string;
  roleId: string;
  roleTitle: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: string;
  stageLabel: string;
  status: CandidateStatus;
  noticeDays: number | null;
  /** Only ever populated for a reader with hr_access. */
  expectedCtc: number | null;
  currentCtc: number | null;
  resumeUrl: string | null;
  outcomeNote: string | null;
  updatedAt: string;
  nextRoundAt: string | null;
  feedbackOutstanding: number;
};

export type PanelMember = {
  userId: string;
  name: string;
  isLead: boolean;
  /** Only meaningful to HR: a panel member reading their own interview sees only their own card. */
  submitted: boolean;
  excused: boolean;
  excusedReason: string | null;
};

export type InterviewSummary = {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateStatus: CandidateStatus;
  roleTitle: string;
  stageCode: string;
  stageLabel: string;
  scheduledAt: string;
  durationMins: number;
  mode: "in_person" | "video" | "phone";
  location: string | null;
  status: RoundStatus;
  panel: PanelMember[];
  questionSetId: string | null;
  questionSetName: string | null;
  questionCount: number;
  scorecardsIn: number;
  /** Held, or its time has passed without being called off. */
  happened: boolean;
  /** Its start time has passed. Computed on the server, so the screen never reads the clock. */
  started: boolean;
  /** Where the viewer's own write-up stands — "none" when they have not started one or are not on the panel. */
  mine: "submitted" | "draft" | "none";
};

export type ScorecardAnswer = {
  questionId: string;
  prompt: string;
  guidance: string | null;
  seq: number;
  rating: number | null;
  notes: string | null;
};

export type Scorecard = {
  interviewId: string;
  by: string;
  byUserId: string;
  recommendation: "strong_yes" | "yes" | "no" | "strong_no" | null;
  strengths: string | null;
  concerns: string | null;
  submittedAt: string | null;
  answers: ScorecardAnswer[];
};

export type CandidateActivity = {
  at: string;
  by: string | null;
  what: string;
  detail: string | null;
};

export type PriorApplication = {
  id: string;
  name: string;
  roleTitle: string;
  status: CandidateStatus;
  stageLabel: string;
  outcomeNote: string | null;
  createdAt: string;
};

export type CandidateDetail = CandidateSummary & {
  interviews: InterviewSummary[];
  scorecards: Scorecard[];
  activity: CandidateActivity[];
  previous: PriorApplication[];
};

export type QuestionSet = {
  id: string;
  name: string;
  stageCode: string | null;
  stageLabel: string | null;
  roleId: string | null;
  roleTitle: string | null;
  isActive: boolean;
  createdAt: string;
  roundsUsing: number;
  questions: { id: string; seq: number; prompt: string; guidance: string | null }[];
};

export type Colleague = { id: string; name: string; email: string; jobTitle: string | null };

/** What this person is allowed to do, so a screen can stop offering the rest. */
export type HiringRights = {
  see: boolean;    // the board at all
  add: boolean;    // open a seat, add a candidate, schedule or change a round
  decide: boolean; // edit a seat or a candidate, move somebody on, or stop them
};

/** A candidate who has applied before — the form offers "add anyway". */
export class DuplicateCandidateError extends ConflictError {
  constructor(
    message: string,
    readonly matches: PriorApplication[],
  ) {
    super(message);
    this.name = "DuplicateCandidateError";
  }
}

/** An action that is allowed, but not without saying yes to what it does. */
export class NeedsConfirmationError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = "NeedsConfirmationError";
  }
}

/**
 * True when the database has not had db/049 run on it yet. The code can reach
 * a deployment before the migration does; the screens then say so in words
 * instead of failing with a server error.
 */
export function hiringNotInstalled(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01" || code === "3F000";
}

/* ── the door ──────────────────────────────────────────────────────────── */

export async function hiringRights(user: SessionUser): Promise<HiringRights> {
  const [see, add, decide] = await Promise.all([
    can(user, "hr_access", "hiring"),
    can(user, "create", "hiring"),
    can(user, "edit", "hiring"),
  ]);
  return {
    see: see.allowed,
    add: see.allowed && add.allowed,
    decide: see.allowed && decide.allowed,
  };
}

async function requireReader(user: SessionUser): Promise<void> {
  const decision = await can(user, "hr_access", "hiring");
  if (!decision.allowed) throw new PermissionError(user, "hr_access", "hiring");
}

async function requireAdder(user: SessionUser): Promise<void> {
  await requireReader(user);
  const decision = await can(user, "create", "hiring");
  if (!decision.allowed) throw new PermissionError(user, "create", "hiring");
}

async function requireDecider(user: SessionUser): Promise<void> {
  await requireReader(user);
  const decision = await can(user, "edit", "hiring");
  if (!decision.allowed) throw new PermissionError(user, "edit", "hiring");
}

async function isPanelist(user: SessionUser, interviewId: string): Promise<boolean> {
  const rows = await query<{ one: number }>(
    `SELECT 1 AS one FROM hr.interview_panel
      WHERE interview_id = $1 AND user_id = $2`,
    [interviewId, user.id],
  );
  return rows.length > 0;
}

/**
 * Sitting on the panel is its own permission and deliberately not hr_access:
 * the whole point of a panel is that somebody outside HR is in the room.
 */
async function requirePanelist(user: SessionUser, interviewId: string): Promise<void> {
  if (!(await isPanelist(user, interviewId))) {
    throw new PermissionError(user, "edit", "hiring");
  }
}

/* ── shared SQL ────────────────────────────────────────────────────────── */

/** The fenced query handed out by withUserContext. */
type Queryable = typeof query;

/** A round has happened: held, or its time has passed and nobody called it off. */
const HAPPENED = `(i.status = 'done' OR (i.status = 'scheduled'
  AND i.scheduled_at + i.duration_mins * INTERVAL '1 minute' <= NOW()))`;

/** Panel members who met a candidate, have not submitted a write-up, and were not excused. */
async function feedbackOwed(
  q: Queryable,
  candidateId: string,
): Promise<{ count: number; names: string[] }> {
  const rows = await q<{ full_name: string }>(
    `SELECT u.full_name
       FROM hr.interviews i
       JOIN hr.interview_panel p ON p.interview_id = i.id AND p.excused_at IS NULL
       JOIN public.users u ON u.id = p.user_id
       LEFT JOIN hr.scorecards sc
              ON sc.interview_id = i.id AND sc.user_id = p.user_id
             AND sc.submitted_at IS NOT NULL
      WHERE i.candidate_id = $1 AND ${HAPPENED} AND sc.id IS NULL
      ORDER BY i.scheduled_at, u.full_name`,
    [candidateId],
  );
  return { count: rows.length, names: Array.from(new Set(rows.map((r) => r.full_name))) };
}

/**
 * Every way out it names is one that works: a round that did not happen is
 * called off (only while nobody has written it up), and somebody who cannot
 * write it up — on leave, gone — is excused with a reason.
 */
function owedRefusal(owed: { count: number; names: string[] }, name: string, doing: string): string {
  return (
    `${owed.count} interviewer${owed.count === 1 ? " has" : "s have"} not written up ` +
    `a round that has already happened (${owed.names.join(", ")}). ${doing} ` +
    `${name} now decides without them. On the candidate's page, mark a round that ` +
    `did not take place called off or no-show, or excuse somebody who cannot write it up.`
  );
}

/**
 * Accounts that exist to share a login, not people. The tracker's view-only
 * account (db/039) must never sit on a panel: whoever holds its password would
 * read the candidate and write feedback in nobody's name.
 */
const NOT_A_PERSON_DEPARTMENTS = ["TRACKER_VIEW"];

async function seatOf(q: Queryable, roleId: string) {
  const [seat] = await q<{
    id: string;
    title: string;
    status: RoleStatus;
    headcount: number;
    hired: string;
  }>(
    `SELECT r.id, r.title, r.status, r.headcount,
            (SELECT COUNT(*) FROM hr.candidates c
              WHERE c.role_id = r.id AND c.status = 'hired') AS hired
       FROM hr.open_roles r WHERE r.id = $1`,
    [roleId],
  );
  if (!seat) throw new NotFoundError(`No open role ${roleId}`);
  return { ...seat, hired: Number(seat.hired) };
}

/* ── the pipeline itself ───────────────────────────────────────────────── */

export async function listStages(): Promise<Stage[]> {
  const rows = await query<{
    code: string;
    label: string;
    seq: number;
    is_final: boolean;
    description: string | null;
  }>(
    `SELECT code, label, seq, is_final, description
       FROM hr.interview_stages ORDER BY seq`,
  );
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    seq: r.seq,
    isFinal: r.is_final,
    description: r.description,
  }));
}

async function stageOrFail(code: string): Promise<Stage> {
  const stages = await listStages();
  const stage = stages.find((s) => s.code === code);
  if (!stage) {
    throw new BlockingRuleError(
      `"${code}" is not a stage in the pipeline. The stages are rows in ` +
        `hr.interview_stages — add one there rather than here.`,
    );
  }
  return stage;
}

/* ── people to pick ────────────────────────────────────────────────────── */

/**
 * Colleagues for a panel or a hiring lead. Unlike the portal's general search
 * this INCLUDES the person searching: the HR lead scheduling a first call is
 * usually the one holding it, and could not previously put themselves on it.
 */
export async function searchHiringColleagues(
  user: SessionUser,
  q: string,
): Promise<Colleague[]> {
  await requireAdder(user);
  if (q.trim().length < 2) return [];
  const found = await searchColleagues(q, null, 12);
  if (found.length === 0) return [];
  const shared = await query<{ id: string }>(
    `SELECT u.id FROM public.users u JOIN public.departments d ON d.id = u.department_id
      WHERE u.id = ANY($1::uuid[]) AND d.code = ANY($2::text[])`,
    [found.map((f) => f.id), NOT_A_PERSON_DEPARTMENTS],
  );
  const hide = new Set(shared.map((s) => s.id));
  return found.filter((f) => !hide.has(f.id)).slice(0, 10);
}

/** Active people by id, with their names — shared logins are not people. */
async function activeUsers(q: Queryable, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await q<{ id: string; full_name: string }>(
    `SELECT u.id, u.full_name
       FROM public.users u
       LEFT JOIN public.departments d ON d.id = u.department_id
      WHERE u.id = ANY($1::uuid[]) AND u.is_active
        AND (d.code IS NULL OR d.code <> ALL($2::text[]))`,
    [ids, NOT_A_PERSON_DEPARTMENTS],
  );
  return new Map(rows.map((r) => [r.id, r.full_name]));
}

/** Refuses a panel with anybody who is not an active person, and says who. */
async function requirePanelPeople(q: Queryable, ids: string[]): Promise<Map<string, string>> {
  const known = await activeUsers(q, ids);
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length > 0) {
    const named = await q<{ full_name: string }>(
      "SELECT full_name FROM public.users WHERE id = ANY($1::uuid[])",
      [missing],
    );
    const who = named.map((n) => n.full_name).join(", ");
    throw new BlockingRuleError(
      who
        ? `${who} cannot sit on a panel — the account is inactive or a shared login.`
        : "One of the people on that panel is not an account in the portal.",
    );
  }
  return known;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuidOrNull(label: string, value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (!UUID.test(value)) throw new BlockingRuleError(`${label} is not recognised.`);
  return value;
}

/* ── open roles ────────────────────────────────────────────────────────── */

export async function listOpenRoles(user: SessionUser): Promise<OpenRole[]> {
  await requireReader(user);
  return withUserContext(user, async (q) => {
    const rows = await q<{
      id: string;
      title: string;
      department_id: string | null;
      department: string | null;
      headcount: number;
      location: string | null;
      employment: EmploymentType;
      status: RoleStatus;
      hiring_lead_id: string | null;
      hiring_lead: string | null;
      notes: string | null;
      opened_at: Date;
      active: string;
      hired: string;
      stopped: string;
    }>(
      `SELECT r.id, r.title, r.department_id, d.name AS department, r.headcount,
              r.location, r.employment, r.status, r.hiring_lead AS hiring_lead_id,
              u.full_name AS hiring_lead, r.notes, r.opened_at,
              COUNT(c.id) FILTER (WHERE c.status IN ('active','offered')) AS active,
              COUNT(c.id) FILTER (WHERE c.status = 'hired') AS hired,
              COUNT(c.id) FILTER (WHERE c.status IN ('rejected','withdrawn')) AS stopped
         FROM hr.open_roles r
         LEFT JOIN public.departments d ON d.id = r.department_id
         LEFT JOIN public.users u ON u.id = r.hiring_lead
         LEFT JOIN hr.candidates c ON c.role_id = r.id
        GROUP BY r.id, d.name, u.full_name
        ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'on_hold' THEN 1 ELSE 2 END,
                 r.opened_at DESC`,
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      departmentId: r.department_id,
      department: r.department,
      headcount: r.headcount,
      location: r.location,
      employment: r.employment,
      status: r.status,
      hiringLeadId: r.hiring_lead_id,
      hiringLead: r.hiring_lead,
      notes: r.notes,
      openedAt: r.opened_at.toISOString(),
      active: Number(r.active),
      hired: Number(r.hired),
      stopped: Number(r.stopped),
    }));
  });
}

export type RoleInput = {
  title: string;
  departmentId?: string | null;
  headcount?: number;
  location?: string | null;
  employment?: EmploymentType;
  hiringLead?: string | null;
  notes?: string | null;
};

/** Every refusal a seat's fields can earn, in words, before anything is written. */
async function checkRoleInput(
  input: RoleInput,
): Promise<{
  title: string;
  departmentId: string | null;
  headcount: number;
  location: string | null;
  employment: EmploymentType;
  hiringLead: string | null;
  notes: string | null;
}> {
  const title = String(input.title ?? "").trim();
  if (!title) throw new BlockingRuleError("A seat needs a title before it can be opened.");
  const location = (input.location ?? "").trim() || null;
  const tooLong = lengthRefusal([
    { label: "The title", value: title, max: LIMITS.roleTitle },
    { label: "Where", value: location, max: LIMITS.roleLocation },
  ]);
  if (tooLong) throw new BlockingRuleError(tooLong);

  const headcount = input.headcount ?? 1;
  if (!Number.isInteger(headcount) || headcount < 1 || headcount > 500) {
    throw new BlockingRuleError("A seat is for a whole number of people, at least one.");
  }
  const employment = input.employment ?? "full_time";
  if (!EMPLOYMENT_TYPES.includes(employment)) {
    throw new BlockingRuleError("Employment is full-time, contract or intern.");
  }

  const departmentId = requireUuidOrNull("That department", input.departmentId);
  if (departmentId) {
    const [d] = await query<{ id: string }>(
      "SELECT id FROM public.departments WHERE id = $1",
      [departmentId],
    );
    if (!d) throw new BlockingRuleError("That department is not recognised.");
  }
  const hiringLead = requireUuidOrNull("That hiring lead", input.hiringLead);
  if (hiringLead) {
    const [u] = await query<{ id: string }>(
      "SELECT id FROM public.users WHERE id = $1 AND is_active",
      [hiringLead],
    );
    if (!u) throw new BlockingRuleError("That hiring lead is not an active account.");
  }
  return {
    title,
    departmentId,
    headcount,
    location,
    employment,
    hiringLead,
    notes: (input.notes ?? "").trim() || null,
  };
}

export async function openRole(user: SessionUser, input: RoleInput): Promise<{ id: string }> {
  await requireAdder(user);
  const role = await checkRoleInput(input);
  const [row] = await withUserContext(user, (q) =>
    q<{ id: string }>(
      `INSERT INTO hr.open_roles
         (title, department_id, headcount, location, employment, hiring_lead, notes, opened_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        role.title,
        role.departmentId,
        role.headcount,
        role.location,
        role.employment,
        role.hiringLead,
        role.notes,
        user.id,
      ],
    ),
  );
  return { id: row.id };
}

/**
 * Correcting a seat. The headcount cannot go below the people already hired
 * into it — that would describe a seat that is over-filled by definition.
 */
export async function updateRole(
  user: SessionUser,
  roleId: string,
  input: RoleInput,
): Promise<void> {
  await requireDecider(user);
  const role = await checkRoleInput(input);
  const previous = await withUserContext(user, async (q) => {
    const seat = await seatOf(q, roleId);
    if (role.headcount < seat.hired) {
      throw new BlockingRuleError(
        `${seat.hired} ${seat.hired === 1 ? "person is" : "people are"} already hired into ` +
          `"${seat.title}", so the headcount cannot be less than ${seat.hired}.`,
      );
    }
    await q(
      `UPDATE hr.open_roles
          SET title = $2, department_id = $3, headcount = $4, location = $5,
              employment = $6, hiring_lead = $7, notes = $8, updated_at = NOW()
        WHERE id = $1`,
      [
        roleId,
        role.title,
        role.departmentId,
        role.headcount,
        role.location,
        role.employment,
        role.hiringLead,
        role.notes,
      ],
    );
    // A filled seat reopens only when its headcount was RAISED past the people
    // hired. Correcting a typo on a seat that HR marked filled by hand must not
    // quietly reopen it — that is how deliberately stopped people came back.
    let status = seat.status;
    if (seat.status === "filled" && role.headcount > seat.headcount && role.headcount > seat.hired) {
      await q(`UPDATE hr.open_roles SET status = 'open' WHERE id = $1`, [roleId]);
      status = "open";
    }
    return { seat, status };
  });
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "HIRING_SEAT_UPDATE",
    resourceType: "hiring",
    resourceId: roleId,
    oldValues: {
      title: previous.seat.title,
      headcount: previous.seat.headcount,
      status: previous.seat.status,
    },
    newValues: { ...role, status: previous.status },
  });
}

/**
 * Holding, filling or closing a seat. Filling or closing one with people still
 * moving on it is allowed — sometimes the seat really is gone — but not
 * without saying yes to it, because those people are then stuck on a seat
 * that will not take them.
 */
export async function setRoleStatus(
  user: SessionUser,
  roleId: string,
  status: RoleStatus,
  opts: { confirm?: boolean } = {},
): Promise<void> {
  await requireDecider(user);
  await withUserContext(user, async (q) => {
    const seat = await seatOf(q, roleId);
    if (seat.status === status) return;
    if ((status === "filled" || status === "closed") && !opts.confirm) {
      const [{ moving }] = await q<{ moving: string }>(
        `SELECT COUNT(*) AS moving FROM hr.candidates
          WHERE role_id = $1 AND status IN ('active', 'offered')`,
        [roleId],
      );
      const n = Number(moving);
      if (n > 0) {
        throw new NeedsConfirmationError(
          `${n} ${n === 1 ? "person is" : "people are"} still moving on "${seat.title}". ` +
            `Once it is ${status}, nobody on it can be moved on, offered or hired ` +
            `until it is reopened. Mark it ${status} anyway?`,
        );
      }
    }
    await q(
      `UPDATE hr.open_roles SET status = $2, updated_at = NOW() WHERE id = $1`,
      [roleId, status],
    );
  });
}

/* ── candidates ────────────────────────────────────────────────────────── */

type CandidateRow = {
  id: string;
  role_id: string;
  role_title: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: string;
  stage_label: string;
  status: CandidateStatus;
  notice_days: number | null;
  expected_ctc: string | null;
  current_ctc: string | null;
  resume_url: string | null;
  outcome_note: string | null;
  updated_at: Date;
  next_round_at: Date | null;
  feedback_outstanding: string;
};

const CANDIDATE_COLUMNS = `
  c.id, c.role_id, r.title AS role_title, c.full_name, c.email, c.phone,
  c.source, c.stage, s.label AS stage_label, c.status, c.notice_days,
  c.expected_ctc, c.current_ctc, c.resume_url, c.outcome_note, c.updated_at,
  (SELECT MIN(i.scheduled_at) FROM hr.interviews i
    WHERE i.candidate_id = c.id AND i.status = 'scheduled'
      AND i.scheduled_at >= NOW()) AS next_round_at,
  (SELECT COUNT(*)
     FROM hr.interviews i
     JOIN hr.interview_panel p ON p.interview_id = i.id
     LEFT JOIN hr.scorecards sc
            ON sc.interview_id = i.id AND sc.user_id = p.user_id
           AND sc.submitted_at IS NOT NULL
    WHERE i.candidate_id = c.id AND ${HAPPENED} AND sc.id IS NULL) AS feedback_outstanding`;

/**
 * `withMoney` is the column fence. It is a parameter rather than a lookup so
 * that every caller has to answer the question out loud.
 */
function toCandidateSummary(row: CandidateRow, withMoney: boolean): CandidateSummary {
  return {
    id: row.id,
    roleId: row.role_id,
    roleTitle: row.role_title,
    name: row.full_name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    stage: row.stage,
    stageLabel: row.stage_label,
    status: row.status,
    noticeDays: row.notice_days,
    expectedCtc: withMoney && row.expected_ctc != null ? Number(row.expected_ctc) : null,
    currentCtc: withMoney && row.current_ctc != null ? Number(row.current_ctc) : null,
    resumeUrl: row.resume_url,
    outcomeNote: row.outcome_note,
    updatedAt: row.updated_at.toISOString(),
    nextRoundAt: row.next_round_at ? row.next_round_at.toISOString() : null,
    feedbackOutstanding: Number(row.feedback_outstanding),
  };
}

/**
 * The board. `includeClosed` adds the people who stopped — hired, rejected,
 * withdrawn — who are otherwise hidden to keep the board about the work that
 * is still moving, but must stay findable: they are exactly the people
 * somebody will need to look up again.
 */
export async function listCandidates(
  user: SessionUser,
  filter: { roleId?: string | null; includeClosed?: boolean } = {},
): Promise<CandidateSummary[]> {
  await requireReader(user);
  return withUserContext(user, async (q) => {
    const rows = await q<CandidateRow>(
      `SELECT ${CANDIDATE_COLUMNS}
         FROM hr.candidates c
         JOIN hr.open_roles r ON r.id = c.role_id
         JOIN hr.interview_stages s ON s.code = c.stage
        WHERE ($1::uuid IS NULL OR c.role_id = $1::uuid)
          AND ($2::boolean OR c.status IN ('active', 'offered'))
        ORDER BY CASE WHEN c.status IN ('active','offered') THEN 0 ELSE 1 END,
                 s.seq DESC, c.updated_at DESC`,
      [filter.roleId ?? null, filter.includeClosed ?? false],
    );
    return rows.map((r) => toCandidateSummary(r, true));
  });
}

/** Earlier records of the same person, by email or by the last ten digits of their phone. */
async function priorApplications(
  q: Queryable,
  person: { email: string | null; phone: string | null; excludeId?: string | null },
): Promise<PriorApplication[]> {
  const email = person.email?.trim().toLowerCase() || null;
  const phone = phoneKey(person.phone);
  if (!email && !phone) return [];
  const rows = await q<{
    id: string;
    full_name: string;
    role_title: string;
    status: CandidateStatus;
    stage_label: string;
    outcome_note: string | null;
    created_at: Date;
  }>(
    `SELECT c.id, c.full_name, r.title AS role_title, c.status,
            s.label AS stage_label, c.outcome_note, c.created_at
       FROM hr.candidates c
       JOIN hr.open_roles r ON r.id = c.role_id
       JOIN hr.interview_stages s ON s.code = c.stage
      WHERE ($3::uuid IS NULL OR c.id <> $3::uuid)
        AND (($1::text IS NOT NULL AND lower(c.email) = $1::text)
          OR ($2::text IS NOT NULL
              AND right(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g'), 10) = $2::text))
      ORDER BY c.created_at DESC`,
    [email, phone, person.excludeId ?? null],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.full_name,
    roleTitle: r.role_title,
    status: r.status,
    stageLabel: r.stage_label,
    outcomeNote: r.outcome_note,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function getCandidate(user: SessionUser, id: string): Promise<CandidateDetail> {
  await requireReader(user);
  const [row] = await withUserContext(user, (q) =>
    q<CandidateRow>(
      `SELECT ${CANDIDATE_COLUMNS}
         FROM hr.candidates c
         JOIN hr.open_roles r ON r.id = c.role_id
         JOIN hr.interview_stages s ON s.code = c.stage
        WHERE c.id = $1`,
      [id],
    ),
  );
  if (!row) throw new NotFoundError(`No candidate ${id}`);

  const [interviews, scorecards, activity, previous] = await Promise.all([
    listInterviews(user, { candidateId: id }),
    listScorecardsForCandidate(user, id),
    listCandidateActivity(user, id),
    withUserContext(user, (q) =>
      priorApplications(q, { email: row.email, phone: row.phone, excludeId: id }),
    ),
  ]);

  return { ...toCandidateSummary(row, true), interviews, scorecards, activity, previous };
}

export type CandidateInput = {
  roleId: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  currentCtc?: number | null;
  expectedCtc?: number | null;
  noticeDays?: number | null;
  resumeUrl?: string | null;
  confirmDuplicate?: boolean;
};

type CandidateDetails = Omit<CandidateInput, "roleId" | "fullName" | "confirmDuplicate"> & {
  fullName?: string;
};

function checkCandidateDetails(input: CandidateDetails, requireName: boolean) {
  const fullName = input.fullName === undefined ? undefined : String(input.fullName).trim();
  if (requireName && !fullName) throw new BlockingRuleError("A candidate needs a name.");
  if (fullName !== undefined && !fullName) {
    throw new BlockingRuleError("A candidate cannot be left without a name.");
  }
  const email = (input.email ?? "").trim() || null;
  const phone = (input.phone ?? "").trim() || null;
  const source = (input.source ?? "").trim() || null;
  if (!email && !phone) {
    throw new BlockingRuleError(
      "A candidate needs an email address or a phone number — there is no " +
        "point recording somebody nobody can reach.",
    );
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BlockingRuleError("That email address does not look right.");
  }
  const tooLong = lengthRefusal([
    { label: "The name", value: fullName, max: LIMITS.candidateName },
    { label: "Email", value: email, max: LIMITS.email },
    { label: "Phone", value: phone, max: LIMITS.phone },
    { label: "Where they came from", value: source, max: LIMITS.source },
  ]);
  if (tooLong) throw new BlockingRuleError(tooLong);

  const money =
    ctcRefusal("What they are asking", input.expectedCtc) ??
    ctcRefusal("What they earn now", input.currentCtc);
  if (money) throw new BlockingRuleError(money);

  const notice = input.noticeDays ?? null;
  if (notice != null && (!Number.isInteger(notice) || notice < 0 || notice > 365)) {
    throw new BlockingRuleError("Notice is a whole number of days, up to a year.");
  }
  const link = normalizeLink(input.resumeUrl);
  if (!link.ok) throw new BlockingRuleError(link.reason);

  return {
    fullName,
    email,
    phone,
    source,
    currentCtc: input.currentCtc ?? null,
    expectedCtc: input.expectedCtc ?? null,
    noticeDays: notice,
    resumeUrl: link.value,
  };
}

export async function addCandidate(
  user: SessionUser,
  input: CandidateInput,
): Promise<{ id: string; previous: PriorApplication[] }> {
  await requireAdder(user);
  const d = checkCandidateDetails(input, true);
  requireUuidOrNull("That seat", input.roleId);

  const result = await withUserContext(user, async (q) => {
    const seat = await seatOf(q, input.roleId);
    if (seat.status === "closed" || seat.status === "filled") {
      throw new BlockingRuleError(
        `"${seat.title}" is ${seat.status}. Reopen the seat before adding anybody to it.`,
      );
    }

    const previous = await priorApplications(q, { email: d.email, phone: d.phone });
    if (previous.length > 0 && !input.confirmDuplicate) {
      const first = previous[0];
      throw new DuplicateCandidateError(
        `${first.name} has applied before — for "${first.roleTitle}", ` +
          `${first.status} at ${first.stageLabel}` +
          `${first.outcomeNote ? ` ("${first.outcomeNote}")` : ""}. ` +
          `Open that file first, or add them again as a new application.`,
        previous,
      );
    }

    const [row] = await q<{ id: string }>(
      `INSERT INTO hr.candidates
         (role_id, full_name, email, phone, source, current_ctc, expected_ctc,
          notice_days, resume_url, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        input.roleId,
        d.fullName,
        d.email,
        d.phone,
        d.source,
        d.currentCtc,
        d.expectedCtc,
        d.noticeDays,
        d.resumeUrl,
        user.id,
      ],
    );
    await noteActivity(
      q,
      user,
      row.id,
      previous.length > 0 ? "added the candidate again" : "added the candidate",
      previous.length > 0
        ? `applied before for "${previous[0].roleTitle}" — ${previous[0].status}`
        : d.source,
    );
    return { id: row.id, previous };
  });
  return result;
}

/** Correcting what was typed when the candidate was added. */
export async function editCandidate(
  user: SessionUser,
  candidateId: string,
  input: CandidateDetails,
): Promise<void> {
  await requireDecider(user);
  const d = checkCandidateDetails(input, false);

  const changed = await withUserContext(user, async (q) => {
    const [current] = await q<{
      full_name: string;
      email: string | null;
      phone: string | null;
      source: string | null;
      current_ctc: string | null;
      expected_ctc: string | null;
      notice_days: number | null;
      resume_url: string | null;
    }>(
      `SELECT full_name, email, phone, source, current_ctc, expected_ctc,
              notice_days, resume_url
         FROM hr.candidates WHERE id = $1`,
      [candidateId],
    );
    if (!current) throw new NotFoundError(`No candidate ${candidateId}`);

    const next = {
      full_name: d.fullName ?? current.full_name,
      email: d.email,
      phone: d.phone,
      source: d.source,
      current_ctc: d.currentCtc,
      expected_ctc: d.expectedCtc,
      notice_days: d.noticeDays,
      resume_url: d.resumeUrl,
    };
    const labels: Record<keyof typeof next, string> = {
      full_name: "name",
      email: "email",
      phone: "phone",
      source: "source",
      current_ctc: "current pay",
      expected_ctc: "asking",
      notice_days: "notice",
      resume_url: "CV link",
    };
    const fields = (Object.keys(next) as (keyof typeof next)[]).filter((k) => {
      const before = current[k];
      const after = next[k];
      const norm = (v: unknown) => (v == null ? null : String(Number.isNaN(Number(v)) ? v : Number(v)));
      return k === "full_name" || k === "email" || k === "phone" || k === "source" || k === "resume_url"
        ? (before ?? null) !== (after ?? null)
        : norm(before) !== norm(after);
    });
    if (fields.length === 0) return [] as string[];

    await q(
      `UPDATE hr.candidates
          SET full_name = $2, email = $3, phone = $4, source = $5, current_ctc = $6,
              expected_ctc = $7, notice_days = $8, resume_url = $9, updated_at = NOW()
        WHERE id = $1`,
      [
        candidateId,
        next.full_name,
        next.email,
        next.phone,
        next.source,
        next.current_ctc,
        next.expected_ctc,
        next.notice_days,
        next.resume_url,
      ],
    );
    const said = fields.map((k) => labels[k]);
    await noteActivity(q, user, candidateId, "corrected the details", said.join(", "));
    return said;
  });

  if (changed.length > 0) {
    await writeAudit({
      userId: user.id,
      role: user.accessLevel,
      action: "HIRING_CANDIDATE_EDIT",
      resourceType: "hiring",
      resourceId: candidateId,
      newValues: { fields: changed },
    });
  }
}

/**
 * Moving somebody to a stage. The final stage IS the offer: moving there marks
 * the candidate offered, and moving back from it takes the offer back. Two
 * separate controls for "at Offer" and "offered" were how a candidate showed
 * an OFFER pill with no offer on record.
 */
export async function moveCandidate(
  user: SessionUser,
  candidateId: string,
  stageCode: string,
  note?: string | null,
): Promise<void> {
  await requireDecider(user);
  const stage = await stageOrFail(stageCode);

  const outcome = await withUserContext(user, async (q) => {
    const [current] = await q<{
      stage: string;
      status: CandidateStatus;
      full_name: string;
      role_id: string;
    }>(
      "SELECT stage, status, full_name, role_id FROM hr.candidates WHERE id = $1",
      [candidateId],
    );
    if (!current) throw new NotFoundError(`No candidate ${candidateId}`);
    if (!isStillMoving(current.status)) {
      throw new BlockingRuleError(
        `${current.full_name} is ${current.status} and is not moving through ` +
          `the pipeline. Reopen them first if this is a mistake.`,
      );
    }
    if (current.stage === stageCode) {
      throw new BlockingRuleError(`${current.full_name} is already at ${stage.label}.`);
    }

    const seat = await seatOf(q, current.role_id);
    const seatSays = seatRefusal(seat, "move");
    if (seatSays) throw new BlockingRuleError(seatSays);

    const owed = await feedbackOwed(q, candidateId);
    if (owed.count > 0) {
      throw new BlockingRuleError(owedRefusal(owed, current.full_name, "Moving"));
    }

    const status: CandidateStatus = stage.isFinal ? "offered" : "active";
    await q(
      `UPDATE hr.candidates
          SET stage = $2, status = $3, outcome_note = NULL, updated_at = NOW()
        WHERE id = $1`,
      [candidateId, stageCode, status],
    );
    const what =
      status === "offered"
        ? `made an offer (${stage.label})`
        : current.status === "offered"
          ? `took the offer back — moved to ${stage.label}`
          : `moved to ${stage.label}`;
    await noteActivity(q, user, candidateId, what, note?.trim() || null);
    return { from: current, status };
  });

  if (outcome.status !== outcome.from.status) {
    await writeAudit({
      userId: user.id,
      role: user.accessLevel,
      action: "HIRING_DECISION",
      resourceType: "hiring",
      resourceId: candidateId,
      oldValues: { status: outcome.from.status, stage: outcome.from.stage },
      newValues: { status: outcome.status, stage: stageCode, note: note?.trim() || null },
    });
  }
}

/**
 * Where somebody stops — hired, rejected, withdrawn — or reopening somebody
 * who stopped. Everything the decision implies happens in the same
 * transaction: the rounds still ahead of a person who stopped are called off
 * (and their panels told), and the hire that fills the last place marks the
 * seat filled.
 */
export async function decideCandidate(
  user: SessionUser,
  candidateId: string,
  status: CandidateStatus,
  note?: string | null,
  opts: { confirm?: boolean } = {},
): Promise<void> {
  await requireDecider(user);
  const reason = (note ?? "").trim();
  const stages = await listStages();

  const outcome = await withUserContext(user, async (q) => {
    const [row] = await q<{
      status: CandidateStatus;
      stage: string;
      full_name: string;
      role_id: string;
    }>(
      "SELECT status, stage, full_name, role_id FROM hr.candidates WHERE id = $1",
      [candidateId],
    );
    if (!row) throw new NotFoundError(`No candidate ${candidateId}`);

    const refusal = decisionRefusal(row.full_name, row.status, status);
    if (refusal) throw new BlockingRuleError(refusal);
    if (decisionNeedsNote(status) && !reason) {
      throw new BlockingRuleError(
        status === "active"
          ? "Say why they are being reopened, in a sentence."
          : "Say why in a sentence. A decision with no reason is the one nobody " +
              "can act on when this person applies again.",
      );
    }

    const seat = await seatOf(q, row.role_id);
    let seatFilled = false;
    if (status === "hired") {
      const seatSays = seatRefusal(seat, "hire");
      if (seatSays) throw new BlockingRuleError(seatSays);
      const owed = await feedbackOwed(q, candidateId);
      if (owed.count > 0) {
        throw new BlockingRuleError(owedRefusal(owed, row.full_name, "Hiring"));
      }
      seatFilled = seat.hired + 1 >= seat.headcount;

      // The hire that takes the last place fills the seat — and leaves anybody
      // else still moving on it unable to be moved, offered or hired. That is
      // the same consequence setRoleStatus asks about, so it is asked here too.
      if (seatFilled && !opts.confirm) {
        const others = await q<{ full_name: string; status: CandidateStatus }>(
          `SELECT full_name, status FROM hr.candidates
            WHERE role_id = $1 AND id <> $2 AND status IN ('active', 'offered')
            ORDER BY status DESC, full_name`,
          [row.role_id, candidateId],
        );
        if (others.length > 0) {
          const named = others
            .slice(0, 3)
            .map((o) => `${o.full_name}${o.status === "offered" ? " (offered)" : ""}`)
            .join(", ");
          const more = others.length > 3 ? ` and ${others.length - 3} more` : "";
          throw new NeedsConfirmationError(
            `Hiring ${row.full_name} takes the last place on "${seat.title}", so the seat ` +
              `will be marked filled. ${named}${more} ${others.length === 1 ? "is" : "are"} still ` +
              `moving on it and could not be moved on, offered or hired until the seat is ` +
              `reopened — decide ${others.length === 1 ? "them" : "each of them"} afterwards. Hire anyway?`,
          );
        }
      }
    }

    const finalStage = stages.find((s) => s.isFinal)?.code;
    const nextStatus: CandidateStatus =
      status === "active" && row.stage === finalStage ? "offered" : status;

    await q(
      `UPDATE hr.candidates
          SET status = $2, outcome_note = $3, updated_at = NOW()
        WHERE id = $1`,
      [
        candidateId,
        nextStatus,
        status === "rejected" || status === "withdrawn" ? reason : null,
      ],
    );
    await noteActivity(
      q,
      user,
      candidateId,
      status === "active" ? "reopened the candidate" : `marked ${status}`,
      reason || null,
    );

    // Interviews still ahead of somebody who stopped are called off — except
    // any somebody has already written up, which took place.
    let calledOff: RoundForNotice[] = [];
    if (status !== "active") {
      calledOff = await q<RoundForNotice>(
        `UPDATE hr.interviews i SET status = 'cancelled', updated_at = NOW()
           FROM hr.candidates c, hr.open_roles r, hr.interview_stages s
          WHERE i.candidate_id = $1 AND i.status = 'scheduled' AND i.scheduled_at > NOW()
            AND NOT EXISTS (SELECT 1 FROM hr.scorecards sc
                             WHERE sc.interview_id = i.id AND sc.submitted_at IS NOT NULL)
            AND c.id = i.candidate_id AND r.id = c.role_id AND s.code = i.stage_code
          RETURNING i.id, i.scheduled_at, i.mode, i.location, s.label AS stage_label,
                    c.full_name AS candidate_name, r.title AS role_title`,
        [candidateId],
      );
      for (const round of calledOff) {
        await noteActivity(
          q,
          user,
          candidateId,
          `called off ${round.stage_label}`,
          `${formatIST(round.scheduled_at.toISOString())} IST — candidate ${status}`,
        );
      }
    }

    if (seatFilled && (seat.status === "open" || seat.status === "on_hold")) {
      await q(
        `UPDATE hr.open_roles SET status = 'filled', updated_at = NOW() WHERE id = $1`,
        [row.role_id],
      );
      await noteActivity(q, user, candidateId, "filled the seat", `"${seat.title}"`);
    }

    // Reopening the hire who filled a seat frees a place. The seat opens again,
    // or the next candidate could not even be added to it.
    if (
      status === "active" &&
      row.status === "hired" &&
      seat.status === "filled" &&
      seat.hired - 1 < seat.headcount
    ) {
      await q(
        `UPDATE hr.open_roles SET status = 'open', updated_at = NOW() WHERE id = $1`,
        [row.role_id],
      );
      await noteActivity(q, user, candidateId, "reopened the seat", `"${seat.title}" has a place again`);
    }

    const panels = await panelsOf(q, calledOff.map((r) => r.id));
    return { previous: row, nextStatus, calledOff, panels };
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "HIRING_DECISION",
    resourceType: "hiring",
    resourceId: candidateId,
    oldValues: { status: outcome.previous.status, stage: outcome.previous.stage },
    newValues: { status: outcome.nextStatus, stage: outcome.previous.stage, note: reason || null },
  });

  for (const round of outcome.calledOff) {
    await tellPanel(
      "hiring.round_changed",
      user,
      round,
      (outcome.panels.get(round.id) ?? []).filter((id) => id !== user.id),
      `called off — the candidate was ${status}.`,
    );
  }
}

/* ── rounds ────────────────────────────────────────────────────────────── */

type InterviewRow = {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_status: CandidateStatus;
  role_title: string;
  stage_code: string;
  stage_label: string;
  scheduled_at: Date;
  duration_mins: number;
  mode: InterviewSummary["mode"];
  location: string | null;
  status: RoundStatus;
  question_set_id: string | null;
  question_set_name: string | null;
  question_count: string;
  scorecards_in: string;
  my_card: "submitted" | "draft" | "none";
};

const INTERVIEW_COLUMNS = `
  i.id, i.candidate_id, c.full_name AS candidate_name, c.status AS candidate_status,
  r.title AS role_title, i.stage_code, s.label AS stage_label,
  i.scheduled_at, i.duration_mins, i.mode, i.location, i.status,
  i.question_set_id, qs.name AS question_set_name,
  (SELECT COUNT(*) FROM hr.questions qq WHERE qq.set_id = i.question_set_id) AS question_count,
  (SELECT COUNT(*) FROM hr.scorecards sc
    WHERE sc.interview_id = i.id AND sc.submitted_at IS NOT NULL) AS scorecards_in,
  CASE WHEN mine.submitted_at IS NOT NULL THEN 'submitted'
       WHEN mine.id IS NOT NULL THEN 'draft'
       ELSE 'none' END AS my_card`;

const INTERVIEW_JOINS = `
  FROM hr.interviews i
  JOIN hr.candidates c ON c.id = i.candidate_id
  JOIN hr.open_roles r ON r.id = c.role_id
  JOIN hr.interview_stages s ON s.code = i.stage_code
  LEFT JOIN hr.question_sets qs ON qs.id = i.question_set_id`;

/** The viewer's own scorecard, joined on the id passed as the query's first parameter. */
const MINE_JOIN = `
  LEFT JOIN hr.scorecards mine ON mine.interview_id = i.id AND mine.user_id = $1`;

export async function listInterviews(
  user: SessionUser,
  filter: { candidateId?: string; upcomingOnly?: boolean } = {},
): Promise<InterviewSummary[]> {
  await requireReader(user);
  return withUserContext(user, async (q) => {
    const rows = await q<InterviewRow>(
      `SELECT ${INTERVIEW_COLUMNS}
       ${INTERVIEW_JOINS} ${MINE_JOIN}
        WHERE ($2::uuid IS NULL OR i.candidate_id = $2::uuid)
          AND (NOT $3::boolean OR (i.status = 'scheduled' AND i.scheduled_at >= NOW()
                                   AND c.status IN ('active', 'offered')))
        ORDER BY i.scheduled_at ${filter.upcomingOnly ? "ASC" : "DESC"}`,
      [user.id, filter.candidateId ?? null, filter.upcomingOnly ?? false],
    );
    return attachPanels(q, rows);
  });
}

/** One read for every panel rather than one per round. */
async function attachPanels(q: Queryable, rows: InterviewRow[]): Promise<InterviewSummary[]> {
  if (rows.length === 0) return [];
  const panelRows = await q<{
    interview_id: string;
    user_id: string;
    full_name: string;
    is_lead: boolean;
    submitted: boolean;
    excused: boolean;
    excused_reason: string | null;
  }>(
    `SELECT p.interview_id, p.user_id, u.full_name, p.is_lead,
            EXISTS (SELECT 1 FROM hr.scorecards sc
                     WHERE sc.interview_id = p.interview_id AND sc.user_id = p.user_id
                       AND sc.submitted_at IS NOT NULL) AS submitted,
            p.excused_at IS NOT NULL AS excused, p.excused_reason
       FROM hr.interview_panel p
       JOIN public.users u ON u.id = p.user_id
      WHERE p.interview_id = ANY($1::uuid[])
      ORDER BY p.is_lead DESC, u.full_name`,
    [rows.map((r) => r.id)],
  );
  const byInterview = new Map<string, PanelMember[]>();
  for (const p of panelRows) {
    const list = byInterview.get(p.interview_id) ?? [];
    list.push({
      userId: p.user_id,
      name: p.full_name,
      isLead: p.is_lead,
      submitted: p.submitted,
      excused: p.excused,
      excusedReason: p.excused_reason,
    });
    byInterview.set(p.interview_id, list);
  }
  const now = Date.now();
  return rows.map((r) => {
    const scheduledAt = r.scheduled_at.toISOString();
    return {
      id: r.id,
      candidateId: r.candidate_id,
      candidateName: r.candidate_name,
      candidateStatus: r.candidate_status,
      roleTitle: r.role_title,
      stageCode: r.stage_code,
      stageLabel: r.stage_label,
      scheduledAt,
      durationMins: r.duration_mins,
      mode: r.mode,
      location: r.location,
      status: r.status,
      panel: byInterview.get(r.id) ?? [],
      questionSetId: r.question_set_id,
      questionSetName: r.question_set_name,
      questionCount: Number(r.question_count),
      scorecardsIn: Number(r.scorecards_in),
      happened: roundHasHappened(
        { status: r.status, scheduledAt, durationMins: r.duration_mins },
        now,
      ),
      started: r.scheduled_at.getTime() <= now,
      mine: r.my_card,
    };
  });
}

async function panelsOf(q: Queryable, interviewIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (interviewIds.length === 0) return map;
  const rows = await q<{ interview_id: string; user_id: string }>(
    `SELECT interview_id, user_id FROM hr.interview_panel
      WHERE interview_id = ANY($1::uuid[])`,
    [interviewIds],
  );
  for (const r of rows) map.set(r.interview_id, [...(map.get(r.interview_id) ?? []), r.user_id]);
  return map;
}

/** The active question sets, for choosing one in code rather than in SQL. */
async function activeSets(q: Queryable) {
  const rows = await q<{
    id: string;
    name: string;
    role_id: string | null;
    stage_code: string | null;
    is_active: boolean;
    created_at: Date;
  }>(
    `SELECT id, name, role_id, stage_code, is_active, created_at
       FROM hr.question_sets WHERE is_active`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    roleId: r.role_id,
    stageCode: r.stage_code,
    isActive: r.is_active,
    createdAt: r.created_at.toISOString(),
  }));
}

/** The set "Choose for me" means: the same function the schedule form previews. */
export async function pickQuestionSet(
  candidateId: string,
  stageCode: string,
): Promise<string | null> {
  const [candidate] = await query<{ role_id: string }>(
    "SELECT role_id FROM hr.candidates WHERE id = $1",
    [candidateId],
  );
  const sets = await activeSets(query);
  return pickFromSets(sets, candidate?.role_id ?? null, stageCode)?.id ?? null;
}

export type RoundInput = {
  candidateId: string;
  stageCode: string;
  scheduledAt: string;
  durationMins?: number;
  mode?: InterviewSummary["mode"];
  location?: string | null;
  panel: string[];
  questionSetId?: string | null;
};

const MODES: readonly InterviewSummary["mode"][] = ["in_person", "video", "phone"];

function checkRoundTiming(input: {
  scheduledAt: string;
  durationMins?: number;
  mode?: InterviewSummary["mode"];
  location?: string | null;
}) {
  const when = new Date(input.scheduledAt);
  if (!input.scheduledAt || Number.isNaN(when.getTime())) {
    throw new BlockingRuleError("Pick a date and time for the round.");
  }
  const duration = input.durationMins ?? 45;
  if (!Number.isInteger(duration) || duration < 5 || duration > 600) {
    throw new BlockingRuleError("A round lasts between 5 minutes and 10 hours.");
  }
  const mode = input.mode ?? "in_person";
  if (!MODES.includes(mode)) throw new BlockingRuleError("A round is in person, on video or on the phone.");
  const location = (input.location ?? "").trim() || null;
  const tooLong = lengthRefusal([{ label: "Where", value: location, max: LIMITS.roundLocation }]);
  if (tooLong) throw new BlockingRuleError(tooLong);
  return { when, duration, mode, location };
}

/**
 * A round in the diary. The panel is required — a round with nobody in it is
 * the shape of a meeting that quietly does not happen — and the question set
 * is chosen for the round if the caller does not name one. A set that IS named
 * has to fit the candidate's seat and the round's stage: another seat's
 * questions handed to a panel are worse than none.
 */
export async function scheduleInterview(user: SessionUser, input: RoundInput): Promise<{ id: string }> {
  await requireAdder(user);
  const stage = await stageOrFail(input.stageCode);
  if (stage.isFinal) {
    throw new BlockingRuleError(`${stage.label} is not a round. Move the candidate there instead.`);
  }
  const timing = checkRoundTiming(input);
  const panel = Array.from(new Set((input.panel ?? []).filter(Boolean)));
  if (panel.length === 0) {
    throw new BlockingRuleError(
      "A round needs at least one person sitting in it — click a name in the " +
        "list to add them. Nobody writes feedback on a conversation they were not part of.",
    );
  }
  panel.forEach((id) => requireUuidOrNull("One of the people on that panel", id));
  requireUuidOrNull("That question set", input.questionSetId);

  const created = await withUserContext(user, async (q) => {
    const [candidate] = await q<{ status: CandidateStatus; full_name: string; role_id: string }>(
      "SELECT status, full_name, role_id FROM hr.candidates WHERE id = $1",
      [input.candidateId],
    );
    if (!candidate) throw new NotFoundError(`No candidate ${input.candidateId}`);
    if (!isStillMoving(candidate.status)) {
      throw new BlockingRuleError(
        `${candidate.full_name} is ${candidate.status}. Nothing is scheduled ` +
          `for somebody who has stopped moving.`,
      );
    }
    const seat = await seatOf(q, candidate.role_id);
    const seatSays = seatRefusal(seat, "move");
    if (seatSays) throw new BlockingRuleError(seatSays);

    const known = await requirePanelPeople(q, panel);

    const sets = await activeSets(q);
    let questionSetId: string | null;
    if (input.questionSetId) {
      const chosen = sets.find((s) => s.id === input.questionSetId);
      if (!chosen) {
        throw new BlockingRuleError("That question set has been retired or does not exist.");
      }
      if (!setFits(chosen, candidate.role_id, input.stageCode)) {
        throw new BlockingRuleError(
          `"${chosen.name}" was written for a different seat or stage. Pick a set for ` +
            `"${seat.title}" at ${stage.label}, or let the portal choose.`,
        );
      }
      questionSetId = chosen.id;
    } else {
      questionSetId = pickFromSets(sets, candidate.role_id, input.stageCode)?.id ?? null;
    }

    const [row] = await q<{ id: string }>(
      `INSERT INTO hr.interviews
         (candidate_id, stage_code, question_set_id, scheduled_at, duration_mins,
          mode, location, scheduled_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        input.candidateId,
        input.stageCode,
        questionSetId,
        timing.when.toISOString(),
        timing.duration,
        timing.mode,
        timing.location,
        user.id,
      ],
    );
    for (const [index, userId] of panel.entries()) {
      await q(
        `INSERT INTO hr.interview_panel (interview_id, user_id, is_lead)
         VALUES ($1, $2, $3)
         ON CONFLICT (interview_id, user_id) DO NOTHING`,
        [row.id, userId, index === 0],
      );
    }
    await noteActivity(
      q,
      user,
      input.candidateId,
      `scheduled ${stage.label}`,
      `${formatIST(timing.when.toISOString())} IST · ${panel.map((id) => known.get(id)).join(", ")}`,
    );
    return {
      id: row.id,
      notice: {
        id: row.id,
        scheduled_at: timing.when,
        mode: timing.mode,
        location: timing.location,
        stage_label: stage.label,
        candidate_name: candidate.full_name,
        role_title: seat.title,
      } satisfies RoundForNotice,
    };
  });

  await tellPanel("hiring.panel_added", user, created.notice, panel.filter((id) => id !== user.id));
  return { id: created.id };
}

/**
 * Changing a round that is still ahead: its time, length, place, question set
 * or panel. Two things are refused. Taking somebody off a panel after they
 * have started writing it up — their feedback would be left pointing at a
 * round they are no longer part of. And changing the questions once anybody
 * has started answering them.
 */
export async function updateInterview(
  user: SessionUser,
  interviewId: string,
  input: Partial<Omit<RoundInput, "candidateId" | "stageCode">>,
): Promise<void> {
  await requireAdder(user);
  requireUuidOrNull("That question set", input.questionSetId);

  const result = await withUserContext(user, async (q) => {
    const [round] = await q<{
      status: RoundStatus;
      scheduled_at: Date;
      duration_mins: number;
      mode: InterviewSummary["mode"];
      location: string | null;
      question_set_id: string | null;
      candidate_id: string;
      candidate_status: CandidateStatus;
      role_id: string;
      stage_code: string;
      stage_label: string;
      candidate_name: string;
      role_title: string;
    }>(
      `SELECT i.status, i.scheduled_at, i.duration_mins, i.mode, i.location,
              i.question_set_id, i.candidate_id, c.status AS candidate_status, c.role_id,
              i.stage_code, s.label AS stage_label, c.full_name AS candidate_name,
              r.title AS role_title
         FROM hr.interviews i
         JOIN hr.candidates c ON c.id = i.candidate_id
         JOIN hr.open_roles r ON r.id = c.role_id
         JOIN hr.interview_stages s ON s.code = i.stage_code
        WHERE i.id = $1`,
      [interviewId],
    );
    if (!round) throw new NotFoundError(`No interview ${interviewId}`);
    if (round.status === "cancelled" || round.status === "no_show") {
      throw new BlockingRuleError(
        `This interview was ${round.status === "cancelled" ? "called off" : "a no-show"}. ` +
          `Put it back in the diary first if it is going ahead.`,
      );
    }
    if (!isStillMoving(round.candidate_status)) {
      throw new BlockingRuleError(
        `${round.candidate_name} is ${round.candidate_status}. Reopen them before changing their interviews.`,
      );
    }

    const timing = checkRoundTiming({
      scheduledAt: input.scheduledAt ?? round.scheduled_at.toISOString(),
      durationMins: input.durationMins ?? round.duration_mins,
      mode: input.mode ?? round.mode,
      location: input.location === undefined ? round.location : input.location,
    });
    const moved =
      timing.when.getTime() !== round.scheduled_at.getTime() ||
      timing.duration !== round.duration_mins ||
      timing.mode !== round.mode ||
      timing.location !== round.location;
    const setChanged =
      input.questionSetId !== undefined && (input.questionSetId || null) !== round.question_set_id;

    const before = await q<{ user_id: string; is_lead: boolean }>(
      "SELECT user_id, is_lead FROM hr.interview_panel WHERE interview_id = $1 ORDER BY is_lead DESC",
      [interviewId],
    );
    const beforeIds = before.map((p) => p.user_id);
    const panel =
      input.panel === undefined ? beforeIds : Array.from(new Set(input.panel.filter(Boolean)));
    const added = panel.filter((id) => !beforeIds.includes(id));
    const removed = beforeIds.filter((id) => !panel.includes(id));

    // Once an interview has started, the only change left is adding somebody
    // who was in the room. Moving its time would erase the write-ups it is
    // owed; taking people off or swapping its questions would rewrite what
    // happened. What did happen is recorded as held, called off or no-show.
    const started = round.status === "done" || round.scheduled_at.getTime() <= Date.now();
    if (started && (moved || setChanged || removed.length > 0)) {
      throw new BlockingRuleError(
        "This interview has already started, so its time, questions and panel are fixed — " +
          "you can still add somebody who sat in. If it did not go ahead, mark it called off " +
          "or no-show instead.",
      );
    }

    const cards = await q<{ user_id: string; full_name: string }>(
      `SELECT sc.user_id, u.full_name FROM hr.scorecards sc
         JOIN public.users u ON u.id = sc.user_id
        WHERE sc.interview_id = $1`,
      [interviewId],
    );

    let questionSetId = round.question_set_id;
    if (setChanged) {
      if (cards.length > 0) {
        throw new BlockingRuleError(
          "Somebody has already started writing this interview up, so its questions cannot change.",
        );
      }
      if (input.questionSetId) {
        const sets = await activeSets(q);
        const chosen = sets.find((s) => s.id === input.questionSetId);
        if (!chosen) throw new BlockingRuleError("That question set has been retired or does not exist.");
        if (!setFits(chosen, round.role_id, round.stage_code)) {
          throw new BlockingRuleError(`"${chosen.name}" was written for a different seat or stage.`);
        }
      }
      questionSetId = input.questionSetId || null;
    }

    if (panel.length === 0) {
      throw new BlockingRuleError("An interview needs at least one person sitting in it.");
    }
    panel.forEach((id) => requireUuidOrNull("One of the people on that panel", id));
    // Only the people being added are checked: somebody already on the panel
    // who has since left must not stop the interview being moved.
    const addedNames = await requirePanelPeople(q, added);
    const writing = cards.filter((c) => removed.includes(c.user_id));
    if (writing.length > 0) {
      throw new BlockingRuleError(
        `${writing.map((c) => c.full_name).join(", ")} ${writing.length === 1 ? "has" : "have"} ` +
          `already started writing this interview up and cannot be taken off the panel. ` +
          `Excuse them instead if they cannot finish it.`,
      );
    }

    if (removed.length > 0) {
      await q(
        "DELETE FROM hr.interview_panel WHERE interview_id = $1 AND user_id = ANY($2::uuid[])",
        [interviewId, removed],
      );
    }
    for (const userId of added) {
      await q(
        `INSERT INTO hr.interview_panel (interview_id, user_id, is_lead)
         VALUES ($1, $2, FALSE) ON CONFLICT DO NOTHING`,
        [interviewId, userId],
      );
    }
    const currentLead = before.find((p) => p.is_lead)?.user_id ?? null;
    if (input.panel !== undefined && panel[0] !== currentLead) {
      // The first name given leads.
      await q(
        "UPDATE hr.interview_panel SET is_lead = (user_id = $2) WHERE interview_id = $1",
        [interviewId, panel[0]],
      );
    }

    if (moved || setChanged) {
      await q(
        `UPDATE hr.interviews
            SET scheduled_at = $2, duration_mins = $3, mode = $4, location = $5,
                question_set_id = $6, updated_at = NOW()
          WHERE id = $1`,
        [interviewId, timing.when.toISOString(), timing.duration, timing.mode, timing.location, questionSetId],
      );
    }

    if (moved) {
      await noteActivity(
        q,
        user,
        round.candidate_id,
        `rescheduled ${round.stage_label}`,
        `${formatIST(timing.when.toISOString())} IST`,
      );
    }
    if (setChanged) {
      await noteActivity(q, user, round.candidate_id, `changed the ${round.stage_label} questions`, null);
    }
    if (added.length > 0 || removed.length > 0) {
      const removedNames = await q<{ id: string; full_name: string }>(
        "SELECT id, full_name FROM public.users WHERE id = ANY($1::uuid[])",
        [removed],
      );
      const parts = [
        ...(added.length ? [`added ${added.map((id) => addedNames.get(id)).join(", ")}`] : []),
        ...(removed.length
          ? [`removed ${removedNames.map((r) => r.full_name).join(", ")}`]
          : []),
      ];
      await noteActivity(q, user, round.candidate_id, `changed the ${round.stage_label} panel`, parts.join("; "));
    }

    const stayed = beforeIds.filter((id) => !removed.includes(id));
    return {
      moved,
      added,
      removed,
      stayed,
      notice: {
        id: interviewId,
        scheduled_at: timing.when,
        mode: timing.mode,
        location: timing.location,
        stage_label: round.stage_label,
        candidate_name: round.candidate_name,
        role_title: round.role_title,
      } satisfies RoundForNotice,
    };
  });

  const others = (ids: string[]) => ids.filter((id) => id !== user.id);
  await tellPanel("hiring.panel_added", user, result.notice, others(result.added));
  if (result.moved) {
    await tellPanel(
      "hiring.round_changed",
      user,
      result.notice,
      others(result.stayed),
      `moved to ${formatIST(result.notice.scheduled_at.toISOString())} IST.`,
    );
  }
  await tellPanel(
    "hiring.round_changed",
    user,
    result.notice,
    others(result.removed),
    "you are no longer on this panel.",
  );
}

/**
 * Excusing somebody from writing an interview up — on leave, left the
 * company. A reason is required and goes on the trail. They stay on the panel
 * and anything they drafted stays; they simply no longer hold the candidate.
 */
export async function excusePanelist(
  user: SessionUser,
  interviewId: string,
  panelistId: string,
  reason: string,
): Promise<void> {
  await requireDecider(user);
  requireUuidOrNull("That panel member", panelistId);
  const why = (reason ?? "").trim();
  if (!why) throw new BlockingRuleError("Say why they are excused, in a sentence.");

  await withUserContext(user, async (q) => {
    const [member] = await q<{
      full_name: string;
      excused: boolean;
      submitted: boolean;
      status: RoundStatus;
      scheduled_at: Date;
      duration_mins: number;
      candidate_id: string;
      stage_label: string;
    }>(
      `SELECT u.full_name, p.excused_at IS NOT NULL AS excused,
              EXISTS (SELECT 1 FROM hr.scorecards sc
                       WHERE sc.interview_id = p.interview_id AND sc.user_id = p.user_id
                         AND sc.submitted_at IS NOT NULL) AS submitted,
              i.status, i.scheduled_at, i.duration_mins, i.candidate_id, s.label AS stage_label
         FROM hr.interview_panel p
         JOIN public.users u ON u.id = p.user_id
         JOIN hr.interviews i ON i.id = p.interview_id
         JOIN hr.interview_stages s ON s.code = i.stage_code
        WHERE p.interview_id = $1 AND p.user_id = $2`,
      [interviewId, panelistId],
    );
    if (!member) throw new NotFoundError("That person is not on this interview's panel.");
    if (member.submitted) {
      throw new BlockingRuleError(`${member.full_name} has already written this interview up.`);
    }
    if (member.excused) {
      throw new BlockingRuleError(`${member.full_name} is already excused from this write-up.`);
    }
    if (
      !roundHasHappened(
        {
          status: member.status,
          scheduledAt: member.scheduled_at.toISOString(),
          durationMins: member.duration_mins,
        },
        Date.now(),
      )
    ) {
      throw new BlockingRuleError(
        "This interview has not happened yet. Take them off the panel instead, or call the interview off.",
      );
    }
    await q(
      `UPDATE hr.interview_panel
          SET excused_at = NOW(), excused_by = $3, excused_reason = $4
        WHERE interview_id = $1 AND user_id = $2`,
      [interviewId, panelistId, user.id, why],
    );
    await noteActivity(
      q,
      user,
      member.candidate_id,
      `excused ${member.full_name} from the ${member.stage_label} write-up`.slice(0, 80),
      why,
    );
  });
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "HIRING_PANEL_EXCUSE",
    resourceType: "hiring",
    resourceId: interviewId,
    newValues: { panelistId, reason: why },
  });
}

/**
 * Held, called off, or nobody came. A round cannot be marked held before it
 * starts, and a round that already has write-ups in cannot be called off —
 * people wrote up a conversation, so it took place.
 */
export async function setInterviewStatus(
  user: SessionUser,
  interviewId: string,
  status: RoundStatus,
): Promise<void> {
  await requireAdder(user);
  const result = await withUserContext(user, async (q) => {
    const [round] = await q<RoundForNotice & {
      status: RoundStatus;
      candidate_id: string;
      candidate_status: CandidateStatus;
      submitted: string;
    }>(
      `SELECT i.id, i.status, i.scheduled_at, i.mode, i.location, i.candidate_id,
              s.label AS stage_label, c.full_name AS candidate_name, c.status AS candidate_status,
              r.title AS role_title,
              (SELECT COUNT(*) FROM hr.scorecards sc
                WHERE sc.interview_id = i.id AND sc.submitted_at IS NOT NULL) AS submitted
         FROM hr.interviews i
         JOIN hr.candidates c ON c.id = i.candidate_id
         JOIN hr.open_roles r ON r.id = c.role_id
         JOIN hr.interview_stages s ON s.code = i.stage_code
        WHERE i.id = $1`,
      [interviewId],
    );
    if (!round) throw new NotFoundError(`No interview ${interviewId}`);
    if (round.status === status) return null;
    if (status === "done" && round.scheduled_at.getTime() > Date.now()) {
      throw new BlockingRuleError("This round has not started yet, so it cannot be marked held.");
    }
    if ((status === "cancelled" || status === "no_show") && Number(round.submitted) > 0) {
      throw new BlockingRuleError(
        `${Number(round.submitted)} write-up${Number(round.submitted) === 1 ? " is" : "s are"} ` +
          `already in for this round, so it took place.`,
      );
    }
    if (status === "scheduled" && !isStillMoving(round.candidate_status)) {
      throw new BlockingRuleError(
        `${round.candidate_name} is ${round.candidate_status}. Reopen them before putting a round back in the diary.`,
      );
    }
    await q(`UPDATE hr.interviews SET status = $2, updated_at = NOW() WHERE id = $1`, [interviewId, status]);
    const said: Record<RoundStatus, string> = {
      done: "held",
      cancelled: "called off",
      no_show: "no-show",
      scheduled: "back in the diary",
    };
    await noteActivity(q, user, round.candidate_id, `${round.stage_label} marked ${said[status]}`, null);
    const panels = await panelsOf(q, [interviewId]);
    return { round, panel: panels.get(interviewId) ?? [] };
  });

  if (result && (status === "cancelled" || status === "no_show") &&
      result.round.scheduled_at.getTime() > Date.now() - 12 * 3600_000) {
    await tellPanel(
      "hiring.round_changed",
      user,
      result.round,
      result.panel.filter((id) => id !== user.id),
      status === "cancelled" ? "called off." : "the candidate did not come.",
    );
  }
}

/**
 * Every round this person is sitting in — for anybody, HR or not. The panel
 * list is the permission, and RLS hands back only the rounds they are on.
 *
 * Rounds they still owe a write-up for come first, then what is coming up
 * soonest, then the rest.
 */
export async function listMyRounds(user: SessionUser): Promise<InterviewSummary[]> {
  const rounds = await withUserContext(user, async (q) => {
    const rows = await q<InterviewRow>(
      `SELECT ${INTERVIEW_COLUMNS}
       ${INTERVIEW_JOINS} ${MINE_JOIN}
         JOIN hr.interview_panel p ON p.interview_id = i.id AND p.user_id = $1
        WHERE i.status IN ('scheduled', 'done')`,
      [user.id],
    );
    return attachPanels(q, rows);
  });

  const rank = (r: InterviewSummary) =>
    r.happened && r.mine !== "submitted" ? 0 : !r.happened ? 1 : 2;
  return rounds.sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return rank(a) === 1
      ? a.scheduledAt.localeCompare(b.scheduledAt)
      : b.scheduledAt.localeCompare(a.scheduledAt);
  });
}

/* ── notifications ─────────────────────────────────────────────────────── */

type RoundForNotice = {
  id: string;
  scheduled_at: Date;
  mode: InterviewSummary["mode"];
  location: string | null;
  stage_label: string;
  candidate_name: string;
  role_title: string;
};


/**
 * Tells panel members through the notification engine. Every variable either
 * template uses is supplied every time — an unsupplied one renders as literal
 * braces. A failure here never fails the scheduling it was reporting.
 */
async function tellPanel(
  type: "hiring.panel_added" | "hiring.round_changed",
  actor: SessionUser,
  round: RoundForNotice,
  recipientIds: string[],
  change = "",
): Promise<void> {
  if (recipientIds.length === 0) return;
  try {
    await publishEvent({
      type,
      category: "user",
      entityType: "hr_interview",
      entityId: round.id,
      // portal.events.entity_ref is VARCHAR(60); a longer name failed the whole
      // insert and the panel was silently never told.
      entityRef: round.candidate_name.slice(0, 60),
      actorId: actor.id,
      priority: "action_required",
      payload: hiringNoticePayload(round, recipientIds, change),
    });
  } catch (error) {
    console.error("hiring notification failed:", type, error);
  }
}

export function hiringNoticePayload(
  round: RoundForNotice,
  recipientIds: string[],
  change: string,
): Record<string, unknown> {
  return {
    recipientIds,
    interviewId: round.id,
    candidateName: round.candidate_name,
    roleTitle: round.role_title,
    stageLabel: round.stage_label,
    when: formatIST(round.scheduled_at.toISOString()),
    mode: modeLabel(round.mode),
    whereLine: round.location ? ` · ${round.location}` : "",
    change,
  };
}

/* ── the questions ─────────────────────────────────────────────────────── */

export async function listQuestionSets(user: SessionUser): Promise<QuestionSet[]> {
  await requireReader(user);
  const sets = await query<{
    id: string;
    name: string;
    stage_code: string | null;
    stage_label: string | null;
    role_id: string | null;
    role_title: string | null;
    is_active: boolean;
    created_at: Date;
    rounds_using: string;
  }>(
    `SELECT qs.id, qs.name, qs.stage_code, s.label AS stage_label,
            qs.role_id, r.title AS role_title, qs.is_active, qs.created_at,
            (SELECT COUNT(*) FROM hr.interviews i WHERE i.question_set_id = qs.id) AS rounds_using
       FROM hr.question_sets qs
       LEFT JOIN hr.interview_stages s ON s.code = qs.stage_code
       LEFT JOIN hr.open_roles r ON r.id = qs.role_id
      ORDER BY qs.is_active DESC, qs.created_at DESC`,
  );
  if (sets.length === 0) return [];

  const questions = await query<{
    id: string;
    set_id: string;
    seq: number;
    prompt: string;
    guidance: string | null;
  }>(
    `SELECT id, set_id, seq, prompt, guidance
       FROM hr.questions WHERE set_id = ANY($1::uuid[]) ORDER BY seq`,
    [sets.map((s) => s.id)],
  );

  return sets.map((s) => ({
    id: s.id,
    name: s.name,
    stageCode: s.stage_code,
    stageLabel: s.stage_label,
    roleId: s.role_id,
    roleTitle: s.role_title,
    isActive: s.is_active,
    createdAt: s.created_at.toISOString(),
    roundsUsing: Number(s.rounds_using),
    questions: questions
      .filter((q) => q.set_id === s.id)
      .map((q) => ({ id: q.id, seq: q.seq, prompt: q.prompt, guidance: q.guidance })),
  }));
}

export type QuestionSetInput = {
  name: string;
  stageCode?: string | null;
  roleId?: string | null;
  questions: { prompt: string; guidance?: string | null }[];
};

async function checkQuestionSetInput(input: QuestionSetInput) {
  const name = String(input.name ?? "").trim();
  if (!name) throw new BlockingRuleError("A question set needs a name.");
  const tooLong = lengthRefusal([{ label: "The name", value: name, max: LIMITS.setName }]);
  if (tooLong) throw new BlockingRuleError(tooLong);

  const drafts = input.questions ?? [];
  for (const [index, q] of drafts.entries()) {
    if (!String(q.prompt ?? "").trim() && String(q.guidance ?? "").trim()) {
      throw new BlockingRuleError(
        `Question ${index + 1} has guidance but no question. Write the question, or clear the guidance.`,
      );
    }
  }
  const questions = drafts
    .map((q) => ({ prompt: String(q.prompt ?? "").trim(), guidance: String(q.guidance ?? "").trim() || null }))
    .filter((q) => q.prompt.length > 0);
  if (questions.length === 0) {
    throw new BlockingRuleError("A question set with no questions asks nothing.");
  }
  if (input.stageCode) await stageOrFail(input.stageCode);
  const roleId = requireUuidOrNull("That seat", input.roleId);
  return { name, stageCode: input.stageCode || null, roleId, questions };
}

export async function createQuestionSet(user: SessionUser, input: QuestionSetInput): Promise<{ id: string }> {
  await requireAdder(user);
  const set = await checkQuestionSetInput(input);
  const id = await withUserContext(user, async (q) => {
    if (set.roleId) await seatOf(q, set.roleId);
    const [row] = await q<{ id: string }>(
      `INSERT INTO hr.question_sets (name, stage_code, role_id, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [set.name, set.stageCode, set.roleId, user.id],
    );
    for (const [index, question] of set.questions.entries()) {
      await q(
        `INSERT INTO hr.questions (set_id, seq, prompt, guidance) VALUES ($1, $2, $3, $4)`,
        [row.id, index + 1, question.prompt, question.guidance],
      );
    }
    return row.id;
  });
  return { id };
}

/**
 * Retiring or restoring a set is always allowed. Rewriting one is allowed
 * only while no round uses it: a round's write-ups answer ITS questions, and
 * changing them underneath would leave answers pointing at questions nobody
 * asked. A set that is in use is retired and replaced.
 */
export async function updateQuestionSet(
  user: SessionUser,
  setId: string,
  input: { isActive?: boolean } & Partial<QuestionSetInput>,
): Promise<void> {
  await requireAdder(user);
  const rewriting =
    input.name !== undefined ||
    input.questions !== undefined ||
    input.stageCode !== undefined ||
    input.roleId !== undefined;
  const content = rewriting
    ? await checkQuestionSetInput({
        name: input.name ?? "",
        stageCode: input.stageCode ?? null,
        roleId: input.roleId ?? null,
        questions: input.questions ?? [],
      })
    : null;

  await withUserContext(user, async (q) => {
    const [set] = await q<{ id: string; rounds_using: string }>(
      `SELECT qs.id,
              (SELECT COUNT(*) FROM hr.interviews i WHERE i.question_set_id = qs.id) AS rounds_using
         FROM hr.question_sets qs WHERE qs.id = $1`,
      [setId],
    );
    if (!set) throw new NotFoundError(`No question set ${setId}`);

    if (content) {
      const using = Number(set.rounds_using);
      if (using > 0) {
        throw new BlockingRuleError(
          `${using} round${using === 1 ? " already uses" : "s already use"} this set, so its ` +
            `questions cannot change. Retire it and write a new one.`,
        );
      }
      if (content.roleId) await seatOf(q, content.roleId);
      await q(
        `UPDATE hr.question_sets SET name = $2, stage_code = $3, role_id = $4 WHERE id = $1`,
        [setId, content.name, content.stageCode, content.roleId],
      );
      await q("DELETE FROM hr.questions WHERE set_id = $1", [setId]);
      for (const [index, question] of content.questions.entries()) {
        await q(
          `INSERT INTO hr.questions (set_id, seq, prompt, guidance) VALUES ($1, $2, $3, $4)`,
          [setId, index + 1, question.prompt, question.guidance],
        );
      }
    }
    if (input.isActive !== undefined) {
      await q("UPDATE hr.question_sets SET is_active = $2 WHERE id = $1", [setId, input.isActive]);
    }
  });
}

/* ── the round page ────────────────────────────────────────────────────── */

export type RoundView = {
  interview: InterviewSummary;
  candidate: Pick<CandidateSummary, "id" | "name" | "roleTitle" | "stageLabel" | "resumeUrl" | "status">;
  questions: { id: string; seq: number; prompt: string; guidance: string | null }[];
  /** The viewer's own scorecard, when they sit on the panel. */
  mine: Scorecard | null;
  isPanelist: boolean;
  /** Why Submit is not available yet, in words — or null when it is. */
  submitBlocked: string | null;
};

/**
 * A round, for the people who sit in it and for HR. HR can open any round to
 * check its time, its panel and the questions attached — before this, the
 * first time anybody saw the questions was when the interviewer opened them.
 * Neither view carries money.
 */
export async function getRound(user: SessionUser, interviewId: string): Promise<RoundView> {
  const panelist = await isPanelist(user, interviewId);
  if (!panelist) {
    const reader = await can(user, "hr_access", "hiring");
    if (!reader.allowed) throw new PermissionError(user, "read", "hiring");
  }

  return withUserContext(user, async (q) => {
    const rows = await q<InterviewRow>(
      `SELECT ${INTERVIEW_COLUMNS} ${INTERVIEW_JOINS} ${MINE_JOIN} WHERE i.id = $2`,
      [user.id, interviewId],
    );
    if (rows.length === 0) throw new NotFoundError(`No interview ${interviewId}`);
    const [interview] = await attachPanels(q, rows);

    const [candidate] = await q<{ resume_url: string | null; stage_label: string }>(
      `SELECT c.resume_url, s.label AS stage_label
         FROM hr.candidates c JOIN hr.interview_stages s ON s.code = c.stage
        WHERE c.id = $1`,
      [interview.candidateId],
    );

    const questions = interview.questionSetId
      ? await q<{ id: string; seq: number; prompt: string; guidance: string | null }>(
          `SELECT id, seq, prompt, guidance FROM hr.questions WHERE set_id = $1 ORDER BY seq`,
          [interview.questionSetId],
        )
      : [];

    const mine = panelist ? await readScorecard(q, interviewId, user.id) : null;

    return {
      interview,
      candidate: {
        id: interview.candidateId,
        name: interview.candidateName,
        roleTitle: interview.roleTitle,
        stageLabel: candidate?.stage_label ?? interview.stageLabel,
        resumeUrl: candidate?.resume_url ?? null,
        status: interview.candidateStatus,
      },
      questions,
      mine,
      isPanelist: panelist,
      submitBlocked: scorecardSubmitRefusal(interview, Date.now()),
    };
  });
}

/* ── scorecards ────────────────────────────────────────────────────────── */

async function readScorecard(q: Queryable, interviewId: string, userId: string): Promise<Scorecard | null> {
  const [card] = await q<{
    id: string;
    user_id: string;
    by: string;
    recommendation: Scorecard["recommendation"];
    strengths: string | null;
    concerns: string | null;
    submitted_at: Date | null;
  }>(
    `SELECT sc.id, sc.user_id, u.full_name AS by, sc.recommendation,
            sc.strengths, sc.concerns, sc.submitted_at
       FROM hr.scorecards sc
       JOIN public.users u ON u.id = sc.user_id
      WHERE sc.interview_id = $1 AND sc.user_id = $2`,
    [interviewId, userId],
  );
  if (!card) return null;

  const answers = await q<{
    question_id: string;
    prompt: string;
    guidance: string | null;
    seq: number;
    rating: number | null;
    notes: string | null;
  }>(
    `SELECT a.question_id, qq.prompt, qq.guidance, qq.seq, a.rating, a.notes
       FROM hr.scorecard_answers a
       JOIN hr.questions qq ON qq.id = a.question_id
      WHERE a.scorecard_id = $1 ORDER BY qq.seq`,
    [card.id],
  );

  return {
    interviewId,
    by: card.by,
    byUserId: card.user_id,
    recommendation: card.recommendation,
    strengths: card.strengths,
    concerns: card.concerns,
    submittedAt: card.submitted_at ? card.submitted_at.toISOString() : null,
    answers: answers.map((a) => ({
      questionId: a.question_id,
      prompt: a.prompt,
      guidance: a.guidance,
      seq: a.seq,
      rating: a.rating,
      notes: a.notes,
    })),
  };
}

export async function listScorecardsForCandidate(user: SessionUser, candidateId: string): Promise<Scorecard[]> {
  await requireReader(user);
  return withUserContext(user, async (q) => {
    const cards = await q<{
      id: string;
      interview_id: string;
      user_id: string;
      by: string;
      recommendation: Scorecard["recommendation"];
      strengths: string | null;
      concerns: string | null;
      submitted_at: Date | null;
    }>(
      `SELECT sc.id, sc.interview_id, sc.user_id, u.full_name AS by,
              sc.recommendation, sc.strengths, sc.concerns, sc.submitted_at
         FROM hr.scorecards sc
         JOIN hr.interviews i ON i.id = sc.interview_id
         JOIN public.users u ON u.id = sc.user_id
        WHERE i.candidate_id = $1 AND sc.submitted_at IS NOT NULL
        ORDER BY sc.submitted_at DESC`,
      [candidateId],
    );
    if (cards.length === 0) return [];

    const answers = await q<{
      scorecard_id: string;
      question_id: string;
      prompt: string;
      guidance: string | null;
      seq: number;
      rating: number | null;
      notes: string | null;
    }>(
      `SELECT a.scorecard_id, a.question_id, qq.prompt, qq.guidance, qq.seq,
              a.rating, a.notes
         FROM hr.scorecard_answers a
         JOIN hr.questions qq ON qq.id = a.question_id
        WHERE a.scorecard_id = ANY($1::uuid[])
        ORDER BY qq.seq`,
      [cards.map((c) => c.id)],
    );

    return cards.map((c) => ({
      interviewId: c.interview_id,
      by: c.by,
      byUserId: c.user_id,
      recommendation: c.recommendation,
      strengths: c.strengths,
      concerns: c.concerns,
      submittedAt: c.submitted_at ? c.submitted_at.toISOString() : null,
      answers: answers
        .filter((a) => a.scorecard_id === c.id)
        .map((a) => ({
          questionId: a.question_id,
          prompt: a.prompt,
          guidance: a.guidance,
          seq: a.seq,
          rating: a.rating,
          notes: a.notes,
        })),
    }));
  });
}

/**
 * Your own feedback, saved as a draft or submitted. Submitting is one way,
 * and only once the round has started — what a scorecard is worth is that it
 * was written after the conversation and before its author heard what
 * everybody else thought.
 *
 * The scorecard, its answers and the trail line are one transaction: they all
 * land or none do. They used to be two, and a panel member outside HR got an
 * error on Submit after their scorecard had already been saved.
 */
export async function saveScorecard(
  user: SessionUser,
  interviewId: string,
  input: {
    recommendation?: Scorecard["recommendation"];
    strengths?: string | null;
    concerns?: string | null;
    answers?: { questionId: string; rating?: number | null; notes?: string | null }[];
    submit?: boolean;
  },
): Promise<{ submitted: boolean }> {
  await requirePanelist(user, interviewId);

  if (input.submit && !input.recommendation) {
    throw new BlockingRuleError(
      "Say yes or no before you submit. A rating with no recommendation is " +
        "feedback that decides nothing.",
    );
  }
  for (const answer of input.answers ?? []) {
    if (answer.rating != null && (!Number.isInteger(answer.rating) || answer.rating < 1 || answer.rating > 4)) {
      throw new BlockingRuleError("A rating runs from 1 to 4.");
    }
  }

  await withUserContext(user, async (q) => {
    const [round] = await q<{
      status: RoundStatus;
      scheduled_at: Date;
      candidate_id: string;
      question_set_id: string | null;
      stage_label: string;
    }>(
      `SELECT i.status, i.scheduled_at, i.candidate_id, i.question_set_id, s.label AS stage_label
         FROM hr.interviews i JOIN hr.interview_stages s ON s.code = i.stage_code
        WHERE i.id = $1`,
      [interviewId],
    );
    if (!round) throw new NotFoundError(`No interview ${interviewId}`);
    if (input.submit) {
      const blocked = scorecardSubmitRefusal(
        { status: round.status, scheduledAt: round.scheduled_at.toISOString() },
        Date.now(),
      );
      if (blocked) throw new BlockingRuleError(blocked);
    }

    const answerIds = (input.answers ?? []).map((a) => a.questionId);
    if (answerIds.length > 0) {
      const valid = round.question_set_id
        ? await q<{ id: string }>(
            "SELECT id FROM hr.questions WHERE set_id = $1 AND id = ANY($2::uuid[])",
            [round.question_set_id, answerIds],
          )
        : [];
      if (valid.length !== new Set(answerIds).size) {
        throw new BlockingRuleError("Those answers are for questions this round does not ask.");
      }
    }

    const [existing] = await q<{ id: string; submitted_at: Date | null }>(
      "SELECT id, submitted_at FROM hr.scorecards WHERE interview_id = $1 AND user_id = $2",
      [interviewId, user.id],
    );
    if (existing?.submitted_at) {
      throw new BlockingRuleError(
        "You have already submitted this one. It is what you thought before " +
          "you heard what anybody else thought, and it stays that way.",
      );
    }

    const [card] = existing
      ? await q<{ id: string }>(
          `UPDATE hr.scorecards
              SET recommendation = $2, strengths = $3, concerns = $4,
                  submitted_at = CASE WHEN $5::boolean THEN NOW() ELSE NULL END,
                  updated_at = NOW()
            WHERE id = $1 RETURNING id`,
          [existing.id, input.recommendation ?? null, input.strengths ?? null, input.concerns ?? null, Boolean(input.submit)],
        )
      : await q<{ id: string }>(
          `INSERT INTO hr.scorecards
             (interview_id, user_id, recommendation, strengths, concerns, submitted_at)
           VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::boolean THEN NOW() ELSE NULL END)
           RETURNING id`,
          [interviewId, user.id, input.recommendation ?? null, input.strengths ?? null, input.concerns ?? null, Boolean(input.submit)],
        );

    for (const answer of input.answers ?? []) {
      await q(
        `INSERT INTO hr.scorecard_answers (scorecard_id, question_id, rating, notes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (scorecard_id, question_id)
         DO UPDATE SET rating = EXCLUDED.rating, notes = EXCLUDED.notes`,
        [card.id, answer.questionId, answer.rating ?? null, answer.notes ?? null],
      );
    }

    if (input.submit) {
      await noteActivity(q, user, round.candidate_id, `wrote up ${round.stage_label}`, input.recommendation ?? null);
    }
  });

  return { submitted: Boolean(input.submit) };
}

/* ── the trail ─────────────────────────────────────────────────────────── */

export async function listCandidateActivity(
  user: SessionUser,
  candidateId: string,
  limit = 80,
): Promise<CandidateActivity[]> {
  await requireReader(user);
  return withUserContext(user, async (q) => {
    const rows = await q<{ at: Date; by: string | null; what: string; detail: string | null }>(
      `SELECT a.at, u.full_name AS by, a.what, a.detail
         FROM hr.candidate_activity a
         LEFT JOIN public.users u ON u.id = a.user_id
        WHERE a.candidate_id = $1
        ORDER BY a.at DESC, a.id DESC
        LIMIT $2`,
      [candidateId, limit],
    );
    return rows.map((r) => ({ at: r.at.toISOString(), by: r.by, what: r.what, detail: r.detail }));
  });
}

/**
 * The only way a row reaches the trail. Append-only, by design and by grant.
 * Always written with the transaction that did the thing it records — and with
 * no RETURNING, because a panel member may add a line but not read the trail.
 */
async function noteActivity(
  q: Queryable,
  user: SessionUser,
  candidateId: string,
  what: string,
  detail: string | null,
): Promise<void> {
  await q(
    `INSERT INTO hr.candidate_activity (candidate_id, user_id, what, detail)
     VALUES ($1, $2, $3, $4)`,
    [candidateId, user.id, what.slice(0, 80), detail],
  );
}

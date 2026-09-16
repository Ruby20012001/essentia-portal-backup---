import { query, withUserContext } from "@/lib/db";
import { BlockingRuleError, NotFoundError } from "@/lib/services/blocking";
import { can, PermissionError } from "@/lib/services/permissions";
import { writeAudit } from "@/lib/services/audit";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Hiring and interviews — S11 · People (Brief §32, §36).
 *
 * Hiring has lived in a WhatsApp group and an inbox. The cost of that is not
 * admin: it is that a candidate is asked the same question by four people and
 * the one thing nobody asked is the thing that mattered. This module holds the
 * open seats, the people against them, the rounds, the questions each round
 * asks, and what each interviewer thought.
 *
 * Four rules this file exists to keep.
 *
 *   · Nothing deletes. A candidate is rejected or withdrawn, never removed.
 *     The trail is append-only and there is no update path to it here.
 *
 *   · A panel member is not HR. A department HOD sitting on a round sees that
 *     round and the person they are about to meet — not the board, not the
 *     other candidates, and not what anybody is being paid. Postgres fences
 *     the rows (db/049); the money columns are fenced HERE, by never selecting
 *     them for a reader without hr_access. Both halves are needed and only one
 *     of them is enforced by the database.
 *
 *   · You write your own feedback. A scorecard is keyed to the account that
 *     was signed in, and once it is submitted this file has no path that
 *     changes it.
 *
 *   · The stages are rows (db/049). Nothing here hard-codes the order of the
 *     pipeline, so changing it is an UPDATE rather than a deploy.
 */

/* ── what the module is made of ────────────────────────────────────────── */

export type Stage = {
  code: string;
  label: string;
  seq: number;
  isFinal: boolean;
  description: string | null;
};

export type CandidateStatus =
  | "active"
  | "offered"
  | "hired"
  | "rejected"
  | "withdrawn";

export type RoleStatus = "open" | "on_hold" | "filled" | "closed";

export type OpenRole = {
  id: string;
  title: string;
  department: string | null;
  headcount: number;
  location: string | null;
  employment: "full_time" | "contract" | "intern";
  status: RoleStatus;
  hiringLead: string | null;
  notes: string | null;
  openedAt: string;
  active: number; // candidates still moving
  hired: number;
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

export type PanelMember = { userId: string; name: string; isLead: boolean };

export type InterviewSummary = {
  id: string;
  candidateId: string;
  candidateName: string;
  roleTitle: string;
  stageCode: string;
  stageLabel: string;
  scheduledAt: string;
  durationMins: number;
  mode: "in_person" | "video" | "phone";
  location: string | null;
  status: "scheduled" | "done" | "cancelled" | "no_show";
  panel: PanelMember[];
  questionSetId: string | null;
  scorecardsIn: number;
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

export type CandidateDetail = CandidateSummary & {
  interviews: InterviewSummary[];
  scorecards: Scorecard[];
  activity: CandidateActivity[];
};

export type QuestionSet = {
  id: string;
  name: string;
  stageCode: string | null;
  stageLabel: string | null;
  roleId: string | null;
  roleTitle: string | null;
  isActive: boolean;
  questions: { id: string; seq: number; prompt: string; guidance: string | null }[];
};

/** What this person is allowed to do, so a screen can stop offering the rest. */
export type HiringRights = {
  see: boolean;    // the board at all
  add: boolean;    // open a seat, add a candidate, schedule a round
  decide: boolean; // move somebody on, or stop them
};

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

/**
 * Sitting on the panel is its own permission and deliberately not hr_access:
 * the whole point of a panel is that somebody outside HR is in the room.
 */
async function requirePanelist(
  user: SessionUser,
  interviewId: string,
): Promise<void> {
  const rows = await query<{ one: number }>(
    `SELECT 1 AS one FROM hr.interview_panel
      WHERE interview_id = $1 AND user_id = $2`,
    [interviewId, user.id],
  );
  if (rows.length === 0) {
    throw new PermissionError(user, "edit", "hiring");
  }
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

/* ── open roles ────────────────────────────────────────────────────────── */

export async function listOpenRoles(user: SessionUser): Promise<OpenRole[]> {
  await requireReader(user);
  return withUserContext(user, async (q) => {
    const rows = await q<{
      id: string;
      title: string;
      department: string | null;
      headcount: number;
      location: string | null;
      employment: OpenRole["employment"];
      status: RoleStatus;
      hiring_lead: string | null;
      notes: string | null;
      opened_at: Date;
      active: string;
      hired: string;
    }>(
      `SELECT r.id, r.title, d.name AS department, r.headcount, r.location,
              r.employment, r.status, u.full_name AS hiring_lead, r.notes,
              r.opened_at,
              COUNT(c.id) FILTER (WHERE c.status IN ('active','offered')) AS active,
              COUNT(c.id) FILTER (WHERE c.status = 'hired') AS hired
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
      department: r.department,
      headcount: r.headcount,
      location: r.location,
      employment: r.employment,
      status: r.status,
      hiringLead: r.hiring_lead,
      notes: r.notes,
      openedAt: r.opened_at.toISOString(),
      active: Number(r.active),
      hired: Number(r.hired),
    }));
  });
}

export async function openRole(
  user: SessionUser,
  input: {
    title: string;
    departmentId?: string | null;
    headcount?: number;
    location?: string | null;
    employment?: OpenRole["employment"];
    hiringLead?: string | null;
    notes?: string | null;
  },
): Promise<{ id: string }> {
  await requireAdder(user);
  const title = String(input.title ?? "").trim();
  if (!title) {
    throw new BlockingRuleError("A seat needs a title before it can be opened.");
  }
  const headcount = input.headcount ?? 1;
  if (!Number.isInteger(headcount) || headcount < 1) {
    throw new BlockingRuleError("A seat is for at least one person.");
  }
  const [row] = await withUserContext(user, (q) =>
    q<{ id: string }>(
      `INSERT INTO hr.open_roles
         (title, department_id, headcount, location, employment, hiring_lead, notes, opened_by)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'full_time'), $6, $7, $8)
       RETURNING id`,
      [
        title,
        input.departmentId ?? null,
        headcount,
        input.location ?? null,
        input.employment ?? null,
        input.hiringLead ?? null,
        input.notes ?? null,
        user.id,
      ],
    ),
  );
  return { id: row.id };
}

export async function setRoleStatus(
  user: SessionUser,
  roleId: string,
  status: RoleStatus,
): Promise<void> {
  await requireDecider(user);
  const rows = await withUserContext(user, (q) =>
    q<{ id: string }>(
      `UPDATE hr.open_roles SET status = $2, updated_at = NOW()
        WHERE id = $1 RETURNING id`,
      [roleId, status],
    ),
  );
  if (rows.length === 0) throw new NotFoundError(`No open role ${roleId}`);
}

/* ── candidates ────────────────────────────────────────────────────────── */

/**
 * The board. `feedbackOutstanding` is the number the module exists to drive to
 * zero: rounds that have happened where somebody who sat in has still not
 * written anything down.
 */
export async function listCandidates(
  user: SessionUser,
  filter: { roleId?: string | null; includeClosed?: boolean } = {},
): Promise<CandidateSummary[]> {
  await requireReader(user);
  return withUserContext(user, async (q) => {
    const rows = await q<CandidateRow>(
      `SELECT c.id, c.role_id, r.title AS role_title, c.full_name, c.email,
              c.phone, c.source, c.stage, s.label AS stage_label, c.status,
              c.notice_days, c.expected_ctc, c.current_ctc, c.resume_url,
              c.outcome_note, c.updated_at,
              (SELECT MIN(i.scheduled_at) FROM hr.interviews i
                WHERE i.candidate_id = c.id AND i.status = 'scheduled'
                  AND i.scheduled_at >= NOW()) AS next_round_at,
              (SELECT COUNT(*)
                 FROM hr.interviews i
                 JOIN hr.interview_panel p ON p.interview_id = i.id
                 LEFT JOIN hr.scorecards sc
                        ON sc.interview_id = i.id AND sc.user_id = p.user_id
                       AND sc.submitted_at IS NOT NULL
                WHERE i.candidate_id = c.id AND i.status = 'done'
                  AND sc.id IS NULL) AS feedback_outstanding
         FROM hr.candidates c
         JOIN hr.open_roles r ON r.id = c.role_id
         JOIN hr.interview_stages s ON s.code = c.stage
        WHERE ($1::uuid IS NULL OR c.role_id = $1::uuid)
          AND ($2::boolean OR c.status IN ('active', 'offered'))
        ORDER BY s.seq DESC, c.updated_at DESC`,
      [filter.roleId ?? null, filter.includeClosed ?? false],
    );
    return rows.map((r) => toCandidateSummary(r, true));
  });
}

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

export async function getCandidate(
  user: SessionUser,
  id: string,
): Promise<CandidateDetail> {
  await requireReader(user);
  const [row] = await withUserContext(user, (q) =>
    q<CandidateRow>(
      `SELECT c.id, c.role_id, r.title AS role_title, c.full_name, c.email,
              c.phone, c.source, c.stage, s.label AS stage_label, c.status,
              c.notice_days, c.expected_ctc, c.current_ctc, c.resume_url,
              c.outcome_note, c.updated_at,
              NULL::timestamptz AS next_round_at,
              0 AS feedback_outstanding
         FROM hr.candidates c
         JOIN hr.open_roles r ON r.id = c.role_id
         JOIN hr.interview_stages s ON s.code = c.stage
        WHERE c.id = $1`,
      [id],
    ),
  );
  if (!row) throw new NotFoundError(`No candidate ${id}`);

  const [interviews, scorecards, activity] = await Promise.all([
    listInterviews(user, { candidateId: id }),
    listScorecardsForCandidate(user, id),
    listCandidateActivity(user, id),
  ]);

  const next = interviews
    .filter((i) => i.status === "scheduled" && i.scheduledAt >= new Date().toISOString())
    .map((i) => i.scheduledAt)
    .sort()[0];

  return {
    ...toCandidateSummary(row, true),
    nextRoundAt: next ?? null,
    feedbackOutstanding: interviews
      .filter((i) => i.status === "done")
      .reduce((n, i) => n + Math.max(0, i.panel.length - i.scorecardsIn), 0),
    interviews,
    scorecards,
    activity,
  };
}

export async function addCandidate(
  user: SessionUser,
  input: {
    roleId: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    source?: string | null;
    currentCtc?: number | null;
    expectedCtc?: number | null;
    noticeDays?: number | null;
    resumeUrl?: string | null;
  },
): Promise<{ id: string }> {
  await requireAdder(user);
  const name = String(input.fullName ?? "").trim();
  if (!name) {
    throw new BlockingRuleError("A candidate needs a name.");
  }
  if (!input.email && !input.phone) {
    throw new BlockingRuleError(
      "A candidate needs an email address or a phone number — there is no " +
        "point recording somebody nobody can reach.",
    );
  }
  const [role] = await withUserContext(user, (q) =>
    q<{ status: RoleStatus; title: string }>(
      "SELECT status, title FROM hr.open_roles WHERE id = $1",
      [input.roleId],
    ),
  );
  if (!role) throw new NotFoundError(`No open role ${input.roleId}`);
  if (role.status === "closed" || role.status === "filled") {
    throw new BlockingRuleError(
      `"${role.title}" is ${role.status === "filled" ? "filled" : "closed"}. ` +
        `Reopen the seat before adding anybody to it.`,
    );
  }

  const [row] = await withUserContext(user, (q) =>
    q<{ id: string }>(
      `INSERT INTO hr.candidates
         (role_id, full_name, email, phone, source, current_ctc, expected_ctc,
          notice_days, resume_url, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        input.roleId,
        name,
        input.email ?? null,
        input.phone ?? null,
        input.source ?? null,
        input.currentCtc ?? null,
        input.expectedCtc ?? null,
        input.noticeDays ?? null,
        input.resumeUrl ?? null,
        user.id,
      ],
    ),
  );
  await noteActivity(user, row.id, "added the candidate", input.source ?? null);
  return { id: row.id };
}

/**
 * Moving somebody on. Two refusals worth having in words:
 * a candidate who has stopped moving is not moved, and nobody skips the
 * feedback from a round that has already happened.
 */
export async function moveCandidate(
  user: SessionUser,
  candidateId: string,
  stageCode: string,
  note?: string | null,
): Promise<void> {
  await requireDecider(user);
  const stage = await stageOrFail(stageCode);

  await withUserContext(user, async (q) => {
    const [current] = await q<{ stage: string; status: CandidateStatus; full_name: string }>(
      "SELECT stage, status, full_name FROM hr.candidates WHERE id = $1",
      [candidateId],
    );
    if (!current) throw new NotFoundError(`No candidate ${candidateId}`);
    if (current.status !== "active" && current.status !== "offered") {
      throw new BlockingRuleError(
        `${current.full_name} is ${current.status} and is not moving through ` +
          `the pipeline. Reopen them first if this is a mistake.`,
      );
    }
    if (current.stage === stageCode) {
      throw new BlockingRuleError(
        `${current.full_name} is already at ${stage.label}.`,
      );
    }

    const [{ owed }] = await q<{ owed: string }>(
      `SELECT COUNT(*) AS owed
         FROM hr.interviews i
         JOIN hr.interview_panel p ON p.interview_id = i.id
         LEFT JOIN hr.scorecards sc
                ON sc.interview_id = i.id AND sc.user_id = p.user_id
               AND sc.submitted_at IS NOT NULL
        WHERE i.candidate_id = $1 AND i.status = 'done' AND sc.id IS NULL`,
      [candidateId],
    );
    if (Number(owed) > 0) {
      throw new BlockingRuleError(
        `${Number(owed)} interviewer${Number(owed) === 1 ? " has" : "s have"} ` +
          `not written up a round that has already happened. Moving ` +
          `${current.full_name} on now decides without them.`,
      );
    }

    await q(
      `UPDATE hr.candidates SET stage = $2, updated_at = NOW() WHERE id = $1`,
      [candidateId, stageCode],
    );
  });

  await noteActivity(user, candidateId, `moved to ${stage.label}`, note ?? null);
}

/**
 * Where somebody stops, and why. The note is required for a no: a rejection
 * with no reason is the row that makes the same candidate get called again
 * next year and asked the same questions.
 */
export async function decideCandidate(
  user: SessionUser,
  candidateId: string,
  status: CandidateStatus,
  note?: string | null,
): Promise<void> {
  await requireDecider(user);
  const reason = (note ?? "").trim();
  if ((status === "rejected" || status === "withdrawn") && !reason) {
    throw new BlockingRuleError(
      "Say why in a sentence. A decision with no reason is the one nobody " +
        "can act on when this person applies again.",
    );
  }

  const previous = await withUserContext(user, async (q) => {
    const [row] = await q<{ status: CandidateStatus; stage: string; full_name: string }>(
      "SELECT status, stage, full_name FROM hr.candidates WHERE id = $1",
      [candidateId],
    );
    if (!row) throw new NotFoundError(`No candidate ${candidateId}`);
    await q(
      `UPDATE hr.candidates
          SET status = $2, outcome_note = COALESCE(NULLIF($3, ''), outcome_note),
              updated_at = NOW()
        WHERE id = $1`,
      [candidateId, status, reason],
    );
    return row;
  });

  await noteActivity(user, candidateId, `marked ${status}`, reason || null);
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "HIRING_DECISION",
    resourceType: "hiring",
    resourceId: candidateId,
    oldValues: { status: previous.status, stage: previous.stage },
    newValues: { status, stage: previous.stage, note: reason || null },
  });
}

/* ── rounds ────────────────────────────────────────────────────────────── */

export async function listInterviews(
  user: SessionUser,
  filter: { candidateId?: string; upcomingOnly?: boolean } = {},
): Promise<InterviewSummary[]> {
  await requireReader(user);
  return withUserContext(user, async (q) => {
    const rows = await q<InterviewRow>(
      `SELECT i.id, i.candidate_id, c.full_name AS candidate_name,
              r.title AS role_title, i.stage_code, s.label AS stage_label,
              i.scheduled_at, i.duration_mins, i.mode, i.location, i.status,
              i.question_set_id,
              (SELECT COUNT(*) FROM hr.scorecards sc
                WHERE sc.interview_id = i.id AND sc.submitted_at IS NOT NULL)
                AS scorecards_in
         FROM hr.interviews i
         JOIN hr.candidates c ON c.id = i.candidate_id
         JOIN hr.open_roles r ON r.id = c.role_id
         JOIN hr.interview_stages s ON s.code = i.stage_code
        WHERE ($1::uuid IS NULL OR i.candidate_id = $1::uuid)
          AND (NOT $2::boolean OR (i.status = 'scheduled' AND i.scheduled_at >= NOW()))
        ORDER BY i.scheduled_at ${filter.upcomingOnly ? "ASC" : "DESC"}`,
      [filter.candidateId ?? null, filter.upcomingOnly ?? false],
    );
    return attachPanels(q, rows);
  });
}

type InterviewRow = {
  id: string;
  candidate_id: string;
  candidate_name: string;
  role_title: string;
  stage_code: string;
  stage_label: string;
  scheduled_at: Date;
  duration_mins: number;
  mode: InterviewSummary["mode"];
  location: string | null;
  status: InterviewSummary["status"];
  question_set_id: string | null;
  scorecards_in: string;
};

/** The fenced query handed out by withUserContext. */
type Queryable = typeof query;

/** One read for every panel rather than one per round. */
async function attachPanels(
  q: Queryable,
  rows: InterviewRow[],
): Promise<InterviewSummary[]> {
  if (rows.length === 0) return [];
  const panelRows = await q<{
    interview_id: string;
    user_id: string;
    full_name: string;
    is_lead: boolean;
  }>(
    `SELECT p.interview_id, p.user_id, u.full_name, p.is_lead
       FROM hr.interview_panel p
       JOIN public.users u ON u.id = p.user_id
      WHERE p.interview_id = ANY($1::uuid[])
      ORDER BY p.is_lead DESC, u.full_name`,
    [rows.map((r) => r.id)],
  );
  const byInterview = new Map<string, PanelMember[]>();
  for (const p of panelRows) {
    const list = byInterview.get(p.interview_id) ?? [];
    list.push({ userId: p.user_id, name: p.full_name, isLead: p.is_lead });
    byInterview.set(p.interview_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    candidateId: r.candidate_id,
    candidateName: r.candidate_name,
    roleTitle: r.role_title,
    stageCode: r.stage_code,
    stageLabel: r.stage_label,
    scheduledAt: r.scheduled_at.toISOString(),
    durationMins: r.duration_mins,
    mode: r.mode,
    location: r.location,
    status: r.status,
    panel: byInterview.get(r.id) ?? [],
    questionSetId: r.question_set_id,
    scorecardsIn: Number(r.scorecards_in),
  }));
}

/**
 * A round in the diary. The panel is required — a round with nobody in it is
 * the shape of a meeting that quietly does not happen — and the question set
 * is chosen for the round if the caller does not name one, so two candidates
 * at the same stage are asked the same things without anybody remembering to.
 */
export async function scheduleInterview(
  user: SessionUser,
  input: {
    candidateId: string;
    stageCode: string;
    scheduledAt: string;
    durationMins?: number;
    mode?: InterviewSummary["mode"];
    location?: string | null;
    panel: string[];
    questionSetId?: string | null;
  },
): Promise<{ id: string }> {
  await requireAdder(user);
  const stage = await stageOrFail(input.stageCode);

  const when = new Date(input.scheduledAt);
  if (Number.isNaN(when.getTime())) {
    throw new BlockingRuleError("That is not a date and time.");
  }
  const panel = Array.from(new Set((input.panel ?? []).filter(Boolean)));
  if (panel.length === 0) {
    throw new BlockingRuleError(
      "A round needs at least one person sitting in it. Nobody writes " +
        "feedback on a conversation they were not part of.",
    );
  }

  const questionSetId =
    input.questionSetId ?? (await pickQuestionSet(input.candidateId, input.stageCode));

  const id = await withUserContext(user, async (q) => {
    const [candidate] = await q<{ status: CandidateStatus; full_name: string }>(
      "SELECT status, full_name FROM hr.candidates WHERE id = $1",
      [input.candidateId],
    );
    if (!candidate) throw new NotFoundError(`No candidate ${input.candidateId}`);
    if (candidate.status !== "active" && candidate.status !== "offered") {
      throw new BlockingRuleError(
        `${candidate.full_name} is ${candidate.status}. Nothing is scheduled ` +
          `for somebody who has stopped moving.`,
      );
    }

    const known = await q<{ id: string }>(
      "SELECT id FROM public.users WHERE id = ANY($1::uuid[]) AND is_active",
      [panel],
    );
    if (known.length !== panel.length) {
      throw new BlockingRuleError(
        "One of the people on that panel is not an active account.",
      );
    }

    const [row] = await q<{ id: string }>(
      `INSERT INTO hr.interviews
         (candidate_id, stage_code, question_set_id, scheduled_at, duration_mins,
          mode, location, scheduled_by)
       VALUES ($1, $2, $3, $4, COALESCE($5, 45), COALESCE($6, 'in_person'), $7, $8)
       RETURNING id`,
      [
        input.candidateId,
        input.stageCode,
        questionSetId,
        when.toISOString(),
        input.durationMins ?? null,
        input.mode ?? null,
        input.location ?? null,
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
    return row.id;
  });

  await noteActivity(
    user,
    input.candidateId,
    `scheduled ${stage.label}`,
    when.toISOString(),
  );
  return { id };
}

export async function setInterviewStatus(
  user: SessionUser,
  interviewId: string,
  status: InterviewSummary["status"],
): Promise<void> {
  await requireAdder(user);
  const [row] = await withUserContext(user, (q) =>
    q<{ candidate_id: string; label: string }>(
      `UPDATE hr.interviews i SET status = $2, updated_at = NOW()
         FROM hr.interview_stages s
        WHERE i.id = $1 AND s.code = i.stage_code
        RETURNING i.candidate_id, s.label`,
      [interviewId, status],
    ),
  );
  if (!row) throw new NotFoundError(`No interview ${interviewId}`);
  await noteActivity(user, row.candidate_id, `${row.label} marked ${status}`, null);
}

/**
 * Every round this person is sitting in — for anybody, HR or not. This is the
 * one read in the module that does not need hr_access: the panel list is the
 * permission, and RLS hands back only the rounds they are on.
 */
export async function listMyRounds(user: SessionUser): Promise<InterviewSummary[]> {
  return withUserContext(user, async (q) => {
    const rows = await q<InterviewRow>(
      `SELECT i.id, i.candidate_id, c.full_name AS candidate_name,
              r.title AS role_title, i.stage_code, s.label AS stage_label,
              i.scheduled_at, i.duration_mins, i.mode, i.location, i.status,
              i.question_set_id,
              (SELECT COUNT(*) FROM hr.scorecards sc
                WHERE sc.interview_id = i.id AND sc.submitted_at IS NOT NULL)
                AS scorecards_in
         FROM hr.interviews i
         JOIN hr.interview_panel p ON p.interview_id = i.id AND p.user_id = $1
         JOIN hr.candidates c ON c.id = i.candidate_id
         JOIN hr.open_roles r ON r.id = c.role_id
         JOIN hr.interview_stages s ON s.code = i.stage_code
        WHERE i.status IN ('scheduled', 'done')
        ORDER BY i.scheduled_at DESC`,
      [user.id],
    );
    return attachPanels(q, rows);
  });
}

/* ── the questions ─────────────────────────────────────────────────────── */

/**
 * The most specific set wins: the one written for this role at this stage,
 * then the stage's own, then a general set. Null means the round is a
 * conversation rather than a form, which is a legitimate answer for a first
 * call and a poor one for a technical round.
 */
export async function pickQuestionSet(
  candidateId: string,
  stageCode: string,
): Promise<string | null> {
  const [row] = await query<{ id: string }>(
    `SELECT qs.id
       FROM hr.question_sets qs
       LEFT JOIN hr.candidates c ON c.id = $1
      WHERE qs.is_active
        AND (qs.stage_code = $2 OR qs.stage_code IS NULL)
        AND (qs.role_id = c.role_id OR qs.role_id IS NULL)
      ORDER BY (qs.role_id IS NOT NULL) DESC, (qs.stage_code IS NOT NULL) DESC,
               qs.created_at DESC
      LIMIT 1`,
    [candidateId, stageCode],
  );
  return row?.id ?? null;
}

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
  }>(
    `SELECT qs.id, qs.name, qs.stage_code, s.label AS stage_label,
            qs.role_id, r.title AS role_title, qs.is_active
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
    questions: questions
      .filter((q) => q.set_id === s.id)
      .map((q) => ({ id: q.id, seq: q.seq, prompt: q.prompt, guidance: q.guidance })),
  }));
}

export async function createQuestionSet(
  user: SessionUser,
  input: {
    name: string;
    stageCode?: string | null;
    roleId?: string | null;
    questions: { prompt: string; guidance?: string | null }[];
  },
): Promise<{ id: string }> {
  await requireAdder(user);
  const name = String(input.name ?? "").trim();
  if (!name) throw new BlockingRuleError("A question set needs a name.");
  const questions = (input.questions ?? [])
    .map((q) => ({ prompt: String(q.prompt ?? "").trim(), guidance: q.guidance ?? null }))
    .filter((q) => q.prompt.length > 0);
  if (questions.length === 0) {
    throw new BlockingRuleError("A question set with no questions asks nothing.");
  }
  if (input.stageCode) await stageOrFail(input.stageCode);

  const id = await withUserContext(user, async (q) => {
    const [row] = await q<{ id: string }>(
      `INSERT INTO hr.question_sets (name, stage_code, role_id, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, input.stageCode ?? null, input.roleId ?? null, user.id],
    );
    for (const [index, question] of questions.entries()) {
      await q(
        `INSERT INTO hr.questions (set_id, seq, prompt, guidance)
         VALUES ($1, $2, $3, $4)`,
        [row.id, index + 1, question.prompt, question.guidance],
      );
    }
    return row.id;
  });
  return { id };
}

/* ── scorecards ────────────────────────────────────────────────────────── */

/**
 * The round as the person sitting in it sees it: who they are meeting, what to
 * ask, and their own scorecard. Deliberately no money and no other candidate —
 * an interviewer is told what they need to run the conversation and no more.
 */
export async function getRoundForPanel(
  user: SessionUser,
  interviewId: string,
): Promise<{
  interview: InterviewSummary;
  candidate: Pick<CandidateSummary, "id" | "name" | "roleTitle" | "stageLabel" | "resumeUrl">;
  questions: { id: string; seq: number; prompt: string; guidance: string | null }[];
  mine: Scorecard | null;
}> {
  await requirePanelist(user, interviewId);

  return withUserContext(user, async (q) => {
    const rows = await q<InterviewRow>(
      `SELECT i.id, i.candidate_id, c.full_name AS candidate_name,
              r.title AS role_title, i.stage_code, s.label AS stage_label,
              i.scheduled_at, i.duration_mins, i.mode, i.location, i.status,
              i.question_set_id,
              (SELECT COUNT(*) FROM hr.scorecards sc
                WHERE sc.interview_id = i.id AND sc.submitted_at IS NOT NULL)
                AS scorecards_in
         FROM hr.interviews i
         JOIN hr.candidates c ON c.id = i.candidate_id
         JOIN hr.open_roles r ON r.id = c.role_id
         JOIN hr.interview_stages s ON s.code = i.stage_code
        WHERE i.id = $1`,
      [interviewId],
    );
    if (rows.length === 0) throw new NotFoundError(`No interview ${interviewId}`);
    const [interview] = await attachPanels(q, rows);

    const [resume] = await q<{ resume_url: string | null }>(
      "SELECT resume_url FROM hr.candidates WHERE id = $1",
      [rows[0].candidate_id],
    );

    const questions = rows[0].question_set_id
      ? await q<{ id: string; seq: number; prompt: string; guidance: string | null }>(
          `SELECT id, seq, prompt, guidance FROM hr.questions
            WHERE set_id = $1 ORDER BY seq`,
          [rows[0].question_set_id],
        )
      : [];

    const mine = await readScorecard(q, interviewId, user.id);

    return {
      interview,
      candidate: {
        id: rows[0].candidate_id,
        name: rows[0].candidate_name,
        roleTitle: rows[0].role_title,
        stageLabel: rows[0].stage_label,
        resumeUrl: resume?.resume_url ?? null,
      },
      questions,
      mine,
    };
  });
}

async function readScorecard(
  q: Queryable,
  interviewId: string,
  userId: string,
): Promise<Scorecard | null> {
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

export async function listScorecardsForCandidate(
  user: SessionUser,
  candidateId: string,
): Promise<Scorecard[]> {
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
 * Your own feedback, saved as a draft or submitted. Submitting is one way:
 * there is no path in this file that edits a submitted scorecard, because the
 * value of what somebody thought is that it was written before they heard what
 * everybody else thought.
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
    if (answer.rating != null && (answer.rating < 1 || answer.rating > 4)) {
      throw new BlockingRuleError("A rating runs from 1 to 4.");
    }
  }

  await withUserContext(user, async (q) => {
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
          [
            existing.id,
            input.recommendation ?? null,
            input.strengths ?? null,
            input.concerns ?? null,
            Boolean(input.submit),
          ],
        )
      : await q<{ id: string }>(
          `INSERT INTO hr.scorecards
             (interview_id, user_id, recommendation, strengths, concerns, submitted_at)
           VALUES ($1, $2, $3, $4, $5,
                   CASE WHEN $6::boolean THEN NOW() ELSE NULL END)
           RETURNING id`,
          [
            interviewId,
            user.id,
            input.recommendation ?? null,
            input.strengths ?? null,
            input.concerns ?? null,
            Boolean(input.submit),
          ],
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
  });

  if (input.submit) {
    const [row] = await withUserContext(user, (q) =>
      q<{ candidate_id: string; label: string }>(
        `SELECT i.candidate_id, s.label
           FROM hr.interviews i
           JOIN hr.interview_stages s ON s.code = i.stage_code
          WHERE i.id = $1`,
        [interviewId],
      ),
    );
    if (row) {
      await noteActivity(
        user,
        row.candidate_id,
        `wrote up ${row.label}`,
        input.recommendation ?? null,
      );
    }
  }

  return { submitted: Boolean(input.submit) };
}

/* ── the trail ─────────────────────────────────────────────────────────── */

export async function listCandidateActivity(
  user: SessionUser,
  candidateId: string,
  limit = 60,
): Promise<CandidateActivity[]> {
  await requireReader(user);
  return withUserContext(user, async (q) => {
    const rows = await q<{
      at: Date;
      by: string | null;
      what: string;
      detail: string | null;
    }>(
      `SELECT a.at, u.full_name AS by, a.what, a.detail
         FROM hr.candidate_activity a
         LEFT JOIN public.users u ON u.id = a.user_id
        WHERE a.candidate_id = $1
        ORDER BY a.at DESC
        LIMIT $2`,
      [candidateId, limit],
    );
    return rows.map((r) => ({
      at: r.at.toISOString(),
      by: r.by,
      what: r.what,
      detail: r.detail,
    }));
  });
}

/**
 * The only way a row reaches the trail. Append-only, by design and by grant.
 *
 * Fenced like every other write here: the trail's RLS policy doubles as the
 * INSERT check, so a plain query with no user context would be refused by
 * Postgres rather than silently writing an unattributed row.
 */
async function noteActivity(
  user: SessionUser,
  candidateId: string,
  what: string,
  detail: string | null,
): Promise<void> {
  await withUserContext(user, (q) =>
    q(
      `INSERT INTO hr.candidate_activity (candidate_id, user_id, what, detail)
       VALUES ($1, $2, $3, $4)`,
      [candidateId, user.id, what.slice(0, 80), detail],
    ),
  );
}

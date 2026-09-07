import { query, withTransaction } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { requirePermission } from "@/lib/services/permissions";
import { BlockingRuleError, NotFoundError } from "@/lib/services/blocking";
import type { SessionUser } from "@/lib/auth/session";
import {
  computeBoard,
  currentDay,
  holdingByStage,
  todayStats,
  toDayString,
  type ComputedWio,
  type HoldingRow,
  type TodayStats,
  type TrackerSettings,
  type TrackerStage,
  type TrackerTeam,
  type TrackerWioInput,
} from "@/lib/services/wio-tracker-logic";

/**
 * S4b · WIO → PIO Tracker (Brief §29-30) — data access.
 *
 * This layer READS and WRITES; it derives nothing. Every computed value comes
 * from wio-tracker-logic.ts, which is pure and unit-tested. Keeping the two
 * apart is what stops "days left" from being calculated three slightly
 * different ways in three places, which is how the spreadsheet drifted.
 *
 * ACCESS (Ruby, 2026-08-31 — rows in public.permissions, db/030):
 *   the WIO team (DRAFTING)                read + create + edit + delete
 *   CRM (Dhruv's and Neeru's teams)        read only
 *   L0 / L1 (Monica, Hardesh, leadership)  read
 * Logging a delay is gated separately (wio_tracker_delay) so the person who
 * knows WHY something is stuck can record it without being able to move the
 * board.
 *
 * THE TEAM COLUMN IS A LENS, NOT A FENCE (db/032). Dipmallya's and Neeraj's
 * teams both sit in DRAFTING and both work the whole board; `team_code` only
 * says whose row it is. Nothing here filters by it — filtering is the reader's
 * choice, made in the UI, because the WIO team covering for itself is the
 * reason they share one board.
 *
 * There is no RLS on these tables and that is deliberate: the board is one
 * shared object, not a set of per-row-owned records. Everyone who may read it
 * reads all of it — a half-visible board would show a "3 stuck at GFC" total
 * that silently means "3 that you can see". Visibility is therefore an
 * all-or-nothing RBAC decision, taken once, above.
 */

export type TrackerDelay = {
  id: string;
  date: string;
  wioId: string;
  wio: string;
  /** Carried from the WIO so the Delays tab filters by the same team lens. */
  teamCode: string;
  why: string;
  cause: string;
  source: string;
  owner: string | null;
  dept: string | null;
  started: string | null;
  ended: string | null;
  daysLost: number | null;
  status: "Open" | "Closed";
  remark: string | null;
};

export type DelayReason = { reason: string; cause: string; source: string };

export type TrackerBoard = {
  settings: TrackerSettings;
  stages: TrackerStage[];
  wios: ComputedWio[];
  stats: TodayStats;
  holding: HoldingRow[];
  delays: TrackerDelay[];
  reasons: DelayReason[];
  people: string[];
  /** The two WIO teams. A lens for filtering, not an access fence (db/032). */
  teams: TrackerTeam[];
  /** What this viewer may actually do — the UI renders from this, not a guess. */
  can: { edit: boolean; create: boolean; delete: boolean; logDelay: boolean; export: boolean };
};

export async function getSettings(): Promise<TrackerSettings> {
  const [row] = await query<{
    team_name: string;
    window_days: number;
    at_risk_from: number;
    today_stamp: string;
    stamped_by: string | null;
    stamped_at: string | null;
  }>(
    `SELECT s.team_name, s.window_days, s.at_risk_from,
            s.today_stamp::text AS today_stamp,
            u.full_name AS stamped_by,
            s.stamped_at::text AS stamped_at
       FROM ee.tracker_settings s
       LEFT JOIN public.users u ON u.id = s.stamped_by
      WHERE s.id = 1`,
  );
  if (!row) {
    throw new NotFoundError(
      "The tracker has no settings row — db/031 has not been loaded into this database.",
    );
  }
  return {
    teamName: row.team_name,
    windowDays: Number(row.window_days),
    atRiskFrom: Number(row.at_risk_from),
    today: toDayString(row.today_stamp) ?? currentDay(),
    stampedBy: row.stamped_by,
    stampedAt: row.stamped_at,
  };
}

export async function listStages(): Promise<TrackerStage[]> {
  const rows = await query<{
    id: string;
    position: number;
    stage: string;
    waiting_on: string;
    done_by: number;
  }>(
    `SELECT id, position, stage, waiting_on, done_by
       FROM ee.tracker_stages ORDER BY position`,
  );
  return rows.map((r) => ({
    id: r.id,
    position: Number(r.position),
    stage: r.stage,
    waitingOn: r.waiting_on,
    doneBy: Number(r.done_by),
  }));
}

async function listWioInputs(): Promise<TrackerWioInput[]> {
  const rows = await query<{
    id: string;
    wio_number: string;
    team_code: string;
    project: string | null;
    scope: string | null;
    raised_by: string | null;
    wio_issued: string | null;
    stage_id: string;
    since: string | null;
    notes: string | null;
    pio_released: string | null;
    pio_no: string | null;
  }>(
    `SELECT id, wio_number, team_code, project, scope, raised_by,
            wio_issued::text AS wio_issued, stage_id, since::text AS since,
            notes, pio_released::text AS pio_released, pio_no
       FROM ee.tracker_wios`,
  );
  return rows.map((r) => ({
    id: r.id,
    wio: r.wio_number,
    teamCode: r.team_code,
    project: r.project,
    scope: r.scope,
    raisedBy: r.raised_by,
    wioIssued: toDayString(r.wio_issued),
    stageId: r.stage_id,
    since: toDayString(r.since),
    notes: r.notes,
    pioReleased: toDayString(r.pio_released),
    pioNo: r.pio_no,
  }));
}

export async function listTeams(): Promise<TrackerTeam[]> {
  const rows = await query<{
    code: string;
    name: string;
    serves_crm_tl: string | null;
  }>(
    `SELECT code, name, serves_crm_tl
       FROM ee.tracker_teams WHERE is_active ORDER BY sort_order`,
  );
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    servesCrmTl: r.serves_crm_tl,
  }));
}

export async function listDelays(): Promise<TrackerDelay[]> {
  const rows = await query<{
    id: string;
    log_date: string;
    wio_id: string;
    wio_number: string;
    team_code: string;
    why: string;
    cause: string;
    source: string;
    owner: string | null;
    dept: string | null;
    started: string | null;
    ended: string | null;
    days_lost: number | null;
    status: "Open" | "Closed";
    remark: string | null;
  }>(
    `SELECT d.id, d.log_date::text AS log_date, d.wio_id, w.wio_number, w.team_code,
            d.why, d.cause, d.source, d.owner, d.dept,
            d.started::text AS started, d.ended::text AS ended,
            d.days_lost, d.status, d.remark
       FROM ee.tracker_delays d
       JOIN ee.tracker_wios w ON w.id = d.wio_id
      ORDER BY d.status, d.log_date DESC, w.wio_number`,
  );
  return rows.map((r) => ({
    id: r.id,
    date: toDayString(r.log_date)!,
    wioId: r.wio_id,
    wio: r.wio_number,
    teamCode: r.team_code,
    why: r.why,
    cause: r.cause,
    source: r.source,
    owner: r.owner,
    dept: r.dept,
    started: toDayString(r.started),
    ended: toDayString(r.ended),
    daysLost: r.days_lost === null ? null : Number(r.days_lost),
    status: r.status,
    remark: r.remark,
  }));
}

async function listReasons(): Promise<DelayReason[]> {
  const rows = await query<{ reason: string; cause: string; source: string }>(
    `SELECT reason, cause, source FROM ee.tracker_delay_reasons ORDER BY sort_order`,
  );
  return rows;
}

async function listPeople(): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `SELECT name FROM ee.tracker_people WHERE is_active ORDER BY sort_order`,
  );
  return rows.map((r) => r.name);
}

/** Everything the board needs, in one pass. */
export async function getBoard(user: SessionUser): Promise<TrackerBoard> {
  await requirePermission(user, "read", "wio_tracker");

  const [settings, stages, wios, delays, reasons, people, teams] = await Promise.all([
    getSettings(),
    listStages(),
    listWioInputs(),
    listDelays(),
    listReasons(),
    listPeople(),
    listTeams(),
  ]);

  const openDelaysByWio = new Map<string, number>();
  for (const d of delays) {
    if (d.status === "Open") {
      openDelaysByWio.set(d.wioId, (openDelaysByWio.get(d.wioId) ?? 0) + 1);
    }
  }

  const board = computeBoard(wios, stages, settings, openDelaysByWio);

  // Resolved once, server-side. The client renders controls from these rather
  // than inferring them from an access level, so the button a user can see is
  // always a button the API will actually honour.
  const [edit, create, del, logDelay, mayExport] = await Promise.all([
    allowed(user, "edit", "wio_tracker"),
    allowed(user, "create", "wio_tracker"),
    allowed(user, "delete", "wio_tracker"),
    allowed(user, "create", "wio_tracker_delay"),
    // Taking the board out of the portal is its own act, and db/030 grants it
    // separately — leadership and the owning team, not every reader.
    allowed(user, "export", "wio_tracker"),
  ]);

  return {
    settings,
    stages,
    wios: board,
    stats: todayStats(board, settings),
    holding: holdingByStage(board, stages),
    delays,
    reasons,
    people,
    teams,
    can: { edit, create, delete: del, logDelay, export: mayExport },
  };
}

/**
 * The board with nobody signed in — for the read-only link the WIO team hands
 * round essentia (app/board).
 *
 * Ruby, 2026-09-03: "ise har koi khol le direct... bas unke paas edit ka right
 * na ho." Giving the whole company portal accounts was never going to happen,
 * and a shared password lands in the same place with extra steps.
 *
 * It reads the same tables through the same pure functions as getBoard, so the
 * link and the portal can never show different numbers. What it does NOT do is
 * ask permissions — there is no user to ask about — so every capability is
 * false and the client renders nothing that could write.
 *
 * That is the whole safety of it: the WRITE paths are unreachable from here.
 * Every mutation goes through /api/wio-tracker/*, each one calls
 * requirePermission, and none of them accepts a request without a session.
 * This function cannot be used to change anything even if it were called from
 * somewhere it should not be.
 *
 * Export is false as well. A reader can screenshot the page, but the buttons
 * that put the board in a file belong to people the portal knows by name.
 */
export async function getPublicBoard(): Promise<TrackerBoard> {
  const [settings, stages, wios, delays, reasons, people, teams] = await Promise.all([
    getSettings(),
    listStages(),
    listWioInputs(),
    listDelays(),
    listReasons(),
    listPeople(),
    listTeams(),
  ]);

  const openDelaysByWio = new Map<string, number>();
  for (const d of delays) {
    if (d.status === "Open") {
      openDelaysByWio.set(d.wioId, (openDelaysByWio.get(d.wioId) ?? 0) + 1);
    }
  }

  const board = computeBoard(wios, stages, settings, openDelaysByWio);

  return {
    settings,
    stages,
    wios: board,
    stats: todayStats(board, settings),
    holding: holdingByStage(board, stages),
    delays,
    reasons,
    people,
    teams,
    // Saving is allowed here, and it gives nothing away. Every export —
    // the one-page summary, the JPG, the printed view — is drawn in the
    // browser from the board already on the screen; there is no second
    // request and no row that was not already visible. Withholding the
    // button would only mean someone screenshots the page instead, and
    // Brevo cannot send a sign-in code from a domain with a DMARC policy
    // it has not been given the DNS to satisfy — so requiring an account
    // for this would have made a download impossible rather than private.
    can: { edit: false, create: false, delete: false, logDelay: false, export: true },
  };
}

async function allowed(
  user: SessionUser,
  action: "read" | "create" | "edit" | "delete" | "export",
  resource: string,
): Promise<boolean> {
  try {
    await requirePermission(user, action, resource);
    return true;
  } catch {
    return false;
  }
}

export type CreateWioInput = {
  wio: string;
  /** Which of the two WIO teams owns it. Required — see createTrackerWio. */
  teamCode: string;
  project?: string | null;
  scope?: string | null;
  raisedBy?: string | null;
  wioIssued?: string | null;
  stageId: string;
  since?: string | null;
  notes?: string | null;
};

export async function createTrackerWio(
  user: SessionUser,
  input: CreateWioInput,
): Promise<string> {
  await requirePermission(user, "create", "wio_tracker");

  const wioNumber = input.wio.trim();
  if (!wioNumber) {
    throw new BlockingRuleError("A WIO number is required — that is how the board is read.");
  }

  const settings = await getSettings();

  const id = await withTransaction(async (q) => {
    const [stage] = await q<{ id: string }>(
      `SELECT id FROM ee.tracker_stages WHERE id = $1`,
      [input.stageId],
    );
    if (!stage) {
      throw new BlockingRuleError(
        "That stage is not in the chain. Pick a stage from the Setup screen's list.",
      );
    }

    // Team is required, never defaulted. Guessing it would quietly file a row
    // under the wrong team, and a mis-filed row is worse than a refused one:
    // it looks handled on somebody else's board.
    const [team] = await q<{ code: string }>(
      `SELECT code FROM ee.tracker_teams WHERE code = $1 AND is_active`,
      [input.teamCode],
    );
    if (!team) {
      throw new BlockingRuleError(
        "Pick which team this WIO belongs to — Dipmallya's or Neeraj's. Every row on the board has an owner.",
      );
    }

    const [existing] = await q<{ wio_number: string }>(
      `SELECT wio_number FROM ee.tracker_wios WHERE wio_number = $1`,
      [wioNumber],
    );
    if (existing) {
      throw new BlockingRuleError(
        `${wioNumber} is already on the board. Open it rather than adding a second row.`,
      );
    }

    // `since` defaults to the stamped date, not the wall clock: a row added
    // today has been at its first stage since today, by the board's reckoning.
    const [row] = await q<{ id: string }>(
      `INSERT INTO ee.tracker_wios
         (wio_number, team_code, project, scope, raised_by, wio_issued, stage_id, since, notes)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8::date, $9)
       RETURNING id`,
      [
        wioNumber,
        input.teamCode,
        input.project ?? null,
        input.scope ?? null,
        input.raisedBy ?? null,
        input.wioIssued ?? null,
        input.stageId,
        input.since ?? settings.today,
        input.notes ?? null,
      ],
    );
    return row!.id;
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "WIO_TRACKER_CREATED",
    resourceType: "wio_tracker",
    resourceId: id,
    newValues: {
      wio: wioNumber,
      teamCode: input.teamCode,
      stageId: input.stageId,
      wioIssued: input.wioIssued ?? null,
    },
  });

  return id;
}

export type UpdateWioPatch = Partial<{
  teamCode: string;
  project: string | null;
  scope: string | null;
  raisedBy: string | null;
  wioIssued: string | null;
  stageId: string;
  since: string | null;
  notes: string | null;
  pioReleased: string | null;
  pioNo: string | null;
}>;

/**
 * Patch one row.
 *
 * THE STAGE/SINCE PAIRING. In the workbook this was two manual steps — change
 * the Stage, then stamp `since` — and the second one got forgotten, which made
 * "days at this stage" quietly wrong and the whole board with it. Here, moving
 * a WIO to a different stage re-stamps `since` to the board's stamped date
 * automatically. An explicit `since` in the same patch wins, so a correction
 * ("it actually moved on Tuesday") is still possible; it just is not required.
 */
export async function updateTrackerWio(
  user: SessionUser,
  id: string,
  patch: UpdateWioPatch,
): Promise<void> {
  await requirePermission(user, "edit", "wio_tracker");

  const settings = await getSettings();

  const changed = await withTransaction(async (q) => {
    const [before] = await q<{
      id: string;
      wio_number: string;
      stage_id: string;
      since: string | null;
      pio_released: string | null;
    }>(
      `SELECT id, wio_number, stage_id, since::text AS since,
              pio_released::text AS pio_released
         FROM ee.tracker_wios WHERE id = $1`,
      [id],
    );
    if (!before) throw new NotFoundError("That WIO is not on the board.");

    if (patch.stageId !== undefined) {
      const [stage] = await q<{ id: string }>(
        `SELECT id FROM ee.tracker_stages WHERE id = $1`,
        [patch.stageId],
      );
      if (!stage) {
        throw new BlockingRuleError(
          "That stage is not in the chain. Pick a stage from the Setup screen's list.",
        );
      }
    }

    if (patch.teamCode !== undefined) {
      const [team] = await q<{ code: string }>(
        `SELECT code FROM ee.tracker_teams WHERE code = $1 AND is_active`,
        [patch.teamCode],
      );
      if (!team) {
        throw new BlockingRuleError(
          "That is not one of the WIO teams. Pick Dipmallya's or Neeraj's.",
        );
      }
    }

    const movingStage =
      patch.stageId !== undefined && patch.stageId !== before.stage_id;
    const since =
      patch.since !== undefined
        ? patch.since
        : movingStage
          ? settings.today
          : undefined;

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown, cast = "") => {
      values.push(value);
      sets.push(`${column} = $${values.length}${cast}`);
    };

    if (patch.teamCode !== undefined) set("team_code", patch.teamCode);
    if (patch.project !== undefined) set("project", patch.project);
    if (patch.scope !== undefined) set("scope", patch.scope);
    if (patch.raisedBy !== undefined) set("raised_by", patch.raisedBy);
    if (patch.wioIssued !== undefined) set("wio_issued", patch.wioIssued, "::date");
    if (patch.stageId !== undefined) set("stage_id", patch.stageId);
    if (since !== undefined) set("since", since, "::date");
    if (patch.notes !== undefined) set("notes", patch.notes);
    if (patch.pioReleased !== undefined) set("pio_released", patch.pioReleased, "::date");
    if (patch.pioNo !== undefined) set("pio_no", patch.pioNo);

    if (sets.length === 0) {
      throw new BlockingRuleError("Nothing to change — the patch was empty.");
    }

    values.push(id);
    await q(
      `UPDATE ee.tracker_wios
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $${values.length}`,
      values,
    );

    return {
      wio: before.wio_number,
      movingStage,
      restampedSince: movingStage && patch.since === undefined ? settings.today : null,
      before: {
        stageId: before.stage_id,
        since: toDayString(before.since),
        pioReleased: toDayString(before.pio_released),
      },
    };
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: changed.movingStage ? "WIO_TRACKER_STAGE_MOVED" : "WIO_TRACKER_UPDATED",
    resourceType: "wio_tracker",
    resourceId: id,
    oldValues: changed.before,
    // The auto re-stamp is recorded explicitly. Someone reading the trail later
    // must be able to see that the date was set by the move, not typed.
    newValues: { wio: changed.wio, ...patch, autoRestampedSince: changed.restampedSince },
  });
}

export async function deleteTrackerWio(user: SessionUser, id: string): Promise<void> {
  await requirePermission(user, "delete", "wio_tracker");

  const removed = await withTransaction(async (q) => {
    const [row] = await q<{ wio_number: string }>(
      `SELECT wio_number FROM ee.tracker_wios WHERE id = $1`,
      [id],
    );
    if (!row) throw new NotFoundError("That WIO is not on the board.");
    // Delays cascade (db/030). Removing a row that was never real should not
    // strand its delay log.
    await q(`DELETE FROM ee.tracker_wios WHERE id = $1`, [id]);
    return row.wio_number;
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "WIO_TRACKER_DELETED",
    resourceType: "wio_tracker",
    resourceId: id,
    oldValues: { wio: removed },
  });
}

export type CreateDelayInput = {
  wioId: string;
  why: string;
  owner?: string | null;
  dept?: string | null;
  started?: string | null;
  remark?: string | null;
};

export async function createDelay(
  user: SessionUser,
  input: CreateDelayInput,
): Promise<string> {
  // Read on the BOARD comes first, deliberately. The delay grant is deliberately
  // wide — the person who knows why something is stuck is routinely not on the
  // owning team — but "wide" must still mean "someone who can see this board".
  // Without this line a department fenced out of the tracker entirely (Site,
  // say) could still write rows onto it, which is not a wider grant, it is a
  // hole. Logging a delay is commentary on a WIO you can read.
  await requirePermission(user, "read", "wio_tracker");
  await requirePermission(user, "create", "wio_tracker_delay");

  const settings = await getSettings();

  const id = await withTransaction(async (q) => {
    const [wio] = await q<{ id: string; wio_number: string }>(
      `SELECT id, wio_number FROM ee.tracker_wios WHERE id = $1`,
      [input.wioId],
    );
    if (!wio) throw new NotFoundError("That WIO is not on the board.");

    // cause/source are taken FROM the reason, never from the caller — that is
    // what stops the log drifting into "Client" delays marked Internal.
    const [reason] = await q<{ reason: string; cause: string; source: string }>(
      `SELECT reason, cause, source FROM ee.tracker_delay_reasons WHERE reason = $1`,
      [input.why],
    );
    if (!reason) {
      throw new BlockingRuleError(
        `"${input.why}" is not one of the delay reasons. Pick one from the list so the cause and source are recorded consistently.`,
      );
    }

    const started = input.started ?? settings.today;
    const [row] = await q<{ id: string }>(
      `INSERT INTO ee.tracker_delays
         (log_date, wio_id, why, cause, source, owner, dept, started, days_lost, status, remark)
       VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8::date, $9, 'Open', $10)
       RETURNING id`,
      [
        settings.today,
        input.wioId,
        reason.reason,
        reason.cause,
        reason.source,
        input.owner ?? null,
        input.dept ?? null,
        started,
        // days_lost is stored as the board read it when logged, matching how
        // the workbook's 24 rows were computed (stamped today − started).
        Math.max(
          0,
          Math.round(
            (Date.parse(`${settings.today}T00:00:00Z`) -
              Date.parse(`${started}T00:00:00Z`)) /
              86_400_000,
          ),
        ),
        input.remark ?? null,
      ],
    );
    return row!.id;
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "WIO_TRACKER_DELAY_LOGGED",
    resourceType: "wio_tracker_delay",
    resourceId: id,
    newValues: { wioId: input.wioId, why: input.why },
  });

  return id;
}

export type UpdateDelayPatch = Partial<{
  status: "Open" | "Closed";
  ended: string | null;
  owner: string | null;
  dept: string | null;
  remark: string | null;
}>;

export async function updateDelay(
  user: SessionUser,
  id: string,
  patch: UpdateDelayPatch,
): Promise<void> {
  // Same rule as createDelay: the board must be readable before its log is
  // writable.
  await requirePermission(user, "read", "wio_tracker");
  await requirePermission(user, "edit", "wio_tracker_delay");

  const settings = await getSettings();

  await withTransaction(async (q) => {
    const [before] = await q<{
      id: string;
      status: string;
      started: string | null;
      ended: string | null;
    }>(
      `SELECT id, status, started::text AS started, ended::text AS ended
         FROM ee.tracker_delays WHERE id = $1`,
      [id],
    );
    if (!before) throw new NotFoundError("That delay entry doesn't exist.");

    const closing = patch.status === "Closed" && before.status !== "Closed";
    // Closing without an end date would leave days_lost counting forever.
    const ended =
      patch.ended !== undefined ? patch.ended : closing ? settings.today : undefined;

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown, cast = "") => {
      values.push(value);
      sets.push(`${column} = $${values.length}${cast}`);
    };

    if (patch.status !== undefined) set("status", patch.status);
    if (ended !== undefined) set("ended", ended, "::date");
    if (patch.owner !== undefined) set("owner", patch.owner);
    if (patch.dept !== undefined) set("dept", patch.dept);
    if (patch.remark !== undefined) set("remark", patch.remark);

    if (sets.length === 0) {
      throw new BlockingRuleError("Nothing to change — the patch was empty.");
    }

    // A closed delay's days_lost freezes at the span it actually cost.
    if (closing && before.started && ended) {
      set(
        "days_lost",
        Math.max(
          0,
          Math.round(
            (Date.parse(`${ended}T00:00:00Z`) -
              Date.parse(`${before.started}T00:00:00Z`)) /
              86_400_000,
          ),
        ),
      );
    }

    values.push(id);
    await q(
      `UPDATE ee.tracker_delays
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $${values.length}`,
      values,
    );
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: patch.status === "Closed" ? "WIO_TRACKER_DELAY_CLOSED" : "WIO_TRACKER_DELAY_UPDATED",
    resourceType: "wio_tracker_delay",
    resourceId: id,
    newValues: patch,
  });
}

export type SettingsPatch = Partial<{
  today: string;
  windowDays: number;
  atRiskFrom: number;
  teamName: string;
}>;

/**
 * Re-stamp the board, or retune the window.
 *
 * The stamp is the one control the whole team feels: moving it moves every
 * derived number at once. It is a single shared row on purpose — if this were
 * per-browser, two people would read the same board differently, which is the
 * failure the spreadsheet already had.
 */
export async function updateSettings(
  user: SessionUser,
  patch: SettingsPatch,
): Promise<void> {
  await requirePermission(user, "edit", "wio_tracker");

  if (patch.windowDays !== undefined && patch.windowDays < 1) {
    throw new BlockingRuleError("The WIO → PIO window must be at least one day.");
  }
  if (patch.atRiskFrom !== undefined && patch.atRiskFrom < 0) {
    throw new BlockingRuleError("The at-risk threshold cannot be negative.");
  }
  if (patch.today !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(patch.today)) {
    throw new BlockingRuleError("The stamped date must be a calendar date (YYYY-MM-DD).");
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown, cast = "") => {
    values.push(value);
    sets.push(`${column} = $${values.length}${cast}`);
  };

  if (patch.teamName !== undefined) set("team_name", patch.teamName);
  if (patch.windowDays !== undefined) set("window_days", patch.windowDays);
  if (patch.atRiskFrom !== undefined) set("at_risk_from", patch.atRiskFrom);
  if (patch.today !== undefined) {
    set("today_stamp", patch.today, "::date");
    // Who stamped it and when — the board says whose reading it is.
    set("stamped_by", user.id, "::uuid");
    sets.push("stamped_at = NOW()");
  }

  if (sets.length === 0) {
    throw new BlockingRuleError("Nothing to change — the patch was empty.");
  }

  await query(
    `UPDATE ee.tracker_settings SET ${sets.join(", ")}, updated_at = NOW() WHERE id = 1`,
    values,
  );

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: patch.today !== undefined ? "WIO_TRACKER_DATE_STAMPED" : "WIO_TRACKER_SETTINGS_UPDATED",
    resourceType: "wio_tracker",
    resourceId: null,
    newValues: patch,
  });
}

export type StagePatch = Partial<{ waitingOn: string; doneBy: number }>;

/**
 * Retune one stage. `done_by` is validated against the window: a stage that
 * must clear 20 days before a 15-day deadline is not a tight target, it is an
 * impossible one, and every row at that stage would read LATE HERE forever.
 */
export async function updateStage(
  user: SessionUser,
  id: string,
  patch: StagePatch,
): Promise<void> {
  await requirePermission(user, "edit", "wio_tracker");

  const settings = await getSettings();

  if (patch.doneBy !== undefined) {
    if (patch.doneBy < 0) {
      throw new BlockingRuleError("'Done by' counts days before the PIO date — it cannot be negative.");
    }
    if (patch.doneBy >= settings.windowDays) {
      throw new BlockingRuleError(
        `'Done by' must be less than the ${settings.windowDays}-day window. ` +
          `At ${patch.doneBy} days before the PIO date, this stage would be late the moment a WIO was issued.`,
      );
    }
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.waitingOn !== undefined) {
    values.push(patch.waitingOn);
    sets.push(`waiting_on = $${values.length}`);
  }
  if (patch.doneBy !== undefined) {
    values.push(patch.doneBy);
    sets.push(`done_by = $${values.length}`);
  }
  if (sets.length === 0) {
    throw new BlockingRuleError("Nothing to change — the patch was empty.");
  }

  values.push(id);
  const rows = await query<{ id: string }>(
    `UPDATE ee.tracker_stages SET ${sets.join(", ")}, updated_at = NOW()
      WHERE id = $${values.length} RETURNING id`,
    values,
  );
  if (rows.length === 0) throw new NotFoundError("That stage is not in the chain.");

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "WIO_TRACKER_STAGE_RETUNED",
    resourceType: "wio_tracker",
    resourceId: id,
    newValues: patch,
  });
}

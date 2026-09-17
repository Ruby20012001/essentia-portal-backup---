import { query, withUserContext, type UserContext } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { getConfig } from "@/lib/services/config";
import { requirePermission } from "@/lib/services/permissions";
import { BlockingRuleError, NotFoundError } from "@/lib/services/blocking";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Welcome Letter + the TL read gate (Brief §28 · Velocity Gate 8).
 *
 * The gate has two halves and both are enforced here:
 *
 *   1. TIMELINESS — the letter is drafted within `comms.welcome_letter_sla_hours`
 *      (default 4, configuration not code, ADR-EP-01) of the first instalment
 *      being confirmed. The sweep never back-dates `ai_generated_at`, so a late
 *      draft reads as late and the breach is computed rather than hidden
 *      (ADR-HS-01).
 *
 *   2. THE READ GATE — CLAUDE.md, permanent constraint: "TL must scroll to
 *      bottom of Communication Spine letter before send button activates."
 *      The UI disables the button, but a disabled button is theatre: `sendLetter`
 *      independently refuses when `scroll_complete` is false. The client is
 *      never trusted with a rule this load-bearing.
 *
 * Rows live in portal.communication_spine (db/001) — no new table.
 */

export type LetterStatus = "draft" | "read" | "sent";

export type WelcomeLetter = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string | null;
  familyName: string;
  status: LetterStatus;
  body: string;
  channel: string;
  /** When the first instalment was confirmed — the clock starts here. */
  triggeredAt: string | null;
  draftedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  sentAt: string | null;
  /** Hours from confirmed instalment to draft. Null when either end is unknown. */
  hoursToDraft: number | null;
  /** True when the draft missed the configured promise. */
  slaBreached: boolean;
  /**
   * True when the instalment has only a DATE, not a confirmed time, so the
   * elapsed hours are measured from midnight. Reported, never silently treated
   * as exact (ADR-HS-01).
   */
  slaImprecise: boolean;
};

/** The letter body. A skeleton the TL personalises — never sent unread. */
export function buildWelcomeLetterDraft(p: { familyName: string; projectCode: string }): string {
  return (
    `Dear ${p.familyName},\n\n` +
    `Thank you for placing your home in our hands. Your first instalment is ` +
    `received, and your project ${p.projectCode} is now open with us.\n\n` +
    `Here is what happens next. Your Client Advisor will be in touch this week ` +
    `to walk you through the design programme and to agree the dates that matter ` +
    `to you. From this point you will hear from us every Friday, so you always ` +
    `know where your home stands without having to ask.\n\n` +
    `A home is built twice — once on paper, once on site. We would rather spend ` +
    `the time getting the first one right.\n\n` +
    `Warmly,\nessentia`
  );
}

type Row = {
  id: string;
  project_id: string;
  project_code: string;
  project_name: string | null;
  family_name: string;
  ai_draft: string | null;
  final_content: string | null;
  channel: string | null;
  scroll_complete: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  sent_at: string | null;
  drafted_at: string | null;
  triggered_at: string | null;
  trigger_precise: boolean;
};

function toLetter(r: Row, slaHours: number): WelcomeLetter {
  const hoursToDraft =
    r.triggered_at && r.drafted_at
      ? (new Date(r.drafted_at).getTime() - new Date(r.triggered_at).getTime()) / 3_600_000
      : null;

  return {
    id: r.id,
    projectId: r.project_id,
    projectCode: r.project_code,
    projectName: r.project_name,
    familyName: r.family_name,
    status: r.sent_at ? "sent" : r.scroll_complete ? "read" : "draft",
    body: r.final_content ?? r.ai_draft ?? "",
    channel: r.channel ?? "whatsapp",
    triggeredAt: r.triggered_at,
    draftedAt: r.drafted_at,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    sentAt: r.sent_at,
    hoursToDraft: hoursToDraft == null ? null : Math.round(hoursToDraft * 10) / 10,
    slaBreached: hoursToDraft != null && hoursToDraft > slaHours,
    slaImprecise: !r.trigger_precise,
  };
}

const SELECT_LETTERS = `
  SELECT cs.id, cs.project_id, p.project_code, p.project_name,
         f.primary_contact AS family_name,
         cs.ai_draft, cs.final_content, cs.channel,
         cs.scroll_complete, u.full_name AS reviewed_by,
         cs.reviewed_at::text AS reviewed_at,
         cs.sent_at::text     AS sent_at,
         cs.ai_generated_at::text AS drafted_at,
         -- Read from the letter's own stamp, not from billing: ee.billing_milestones
         -- is fenced to L0/L1, and the TL who works this board must be able to see
         -- whether their letter was on time without seeing the money (db/030).
         cs.trigger_at::text AS triggered_at,
         cs.trigger_precise
    FROM portal.communication_spine cs
    JOIN ee.projects p  ON p.id = cs.project_id
    JOIN public.families f ON f.id = cs.family_id
    LEFT JOIN public.users u ON u.id = cs.reviewed_by
   WHERE cs.letter_type = 'welcome_letter'`;

/**
 * The auto-pilot sweep. For every active project whose FIRST instalment is
 * confirmed and which has no welcome letter yet, draft one. Runs org-wide
 * (owner role, no RLS) so no project is missed because of who happens to be
 * looking. Idempotent: one welcome letter per project, ever.
 */
export async function draftWelcomeLetters(
  _actor: SessionUser,
): Promise<{ drafted: number; projects: string[] }> {
  const due = await query<{
    id: string;
    project_code: string;
    family_id: string;
    family_name: string;
    trigger_at: string;
    trigger_precise: boolean;
  }>(
    // The earliest confirmed instalment is the trigger. Its exact instant is
    // carried onto the letter so the SLA never depends on billing visibility.
    `SELECT p.id, p.project_code, p.family_id, f.primary_contact AS family_name,
            b.trigger_at, b.trigger_precise
       FROM ee.projects p
       JOIN public.families f ON f.id = p.family_id
       JOIN LATERAL (
         SELECT COALESCE(bm.payment_confirmed_at, bm.payment_date::timestamptz) AS trigger_at,
                bm.payment_confirmed_at IS NOT NULL                             AS trigger_precise
           FROM ee.billing_milestones bm
          WHERE bm.project_id = p.id AND bm.amount_paid > 0
          ORDER BY COALESCE(bm.payment_confirmed_at, bm.payment_date::timestamptz)
          LIMIT 1
       ) b ON TRUE
      WHERE p.is_active
        AND NOT EXISTS (
          SELECT 1 FROM portal.communication_spine cs
           WHERE cs.project_id = p.id AND cs.letter_type = 'welcome_letter')
      ORDER BY p.project_code`,
  );

  for (const p of due) {
    const draft = buildWelcomeLetterDraft({ familyName: p.family_name, projectCode: p.project_code });
    await query(
      `INSERT INTO portal.communication_spine
         (project_id, family_id, letter_type, trigger_event,
          trigger_at, trigger_precise,
          ai_draft, ai_model, ai_generated_at, channel)
       VALUES ($1, $2, 'welcome_letter', 'first_instalment_confirmed',
               $3, $4, $5, 'template', NOW(), 'whatsapp')`,
      [p.id, p.family_id, p.trigger_at, p.trigger_precise, draft],
    );
  }

  return { drafted: due.length, projects: due.map((p) => p.project_code) };
}

/** Every welcome letter the viewer may see, newest first. RLS-scoped. */
export async function listWelcomeLetters(user: UserContext): Promise<WelcomeLetter[]> {
  const slaHours = await getConfig<number>("comms.welcome_letter_sla_hours", 4);
  const rows = await withUserContext(user, (q) =>
    q<Row>(`${SELECT_LETTERS} ORDER BY (cs.sent_at IS NOT NULL), cs.created_at DESC`),
  );
  return rows.map((r) => toLetter(r, slaHours));
}

export async function getWelcomeLetter(user: UserContext, id: string): Promise<WelcomeLetter | null> {
  const slaHours = await getConfig<number>("comms.welcome_letter_sla_hours", 4);
  const rows = await withUserContext(user, (q) => q<Row>(`${SELECT_LETTERS} AND cs.id = $1`, [id]));
  return rows[0] ? toLetter(rows[0], slaHours) : null;
}

/**
 * The TL reached the bottom of the letter. This is the ONLY thing that opens
 * the send button, and it is recorded against a named person with a timestamp —
 * "someone read this before it went to a family" has to be answerable later.
 */
export async function markLetterRead(user: SessionUser, id: string): Promise<WelcomeLetter> {
  await requirePermission(user, "approve", "communication_spine");

  const updated = await withUserContext(user, async (q) => {
    const [row] = await q<{ id: string; sent_at: string | null }>(
      `SELECT id, sent_at::text AS sent_at FROM portal.communication_spine
        WHERE id = $1 AND letter_type = 'welcome_letter'`,
      [id],
    );
    if (!row) throw new NotFoundError("That letter doesn't exist, or it isn't one you can see.");
    if (row.sent_at) throw new BlockingRuleError("That letter has already been sent.");

    await q(
      `UPDATE portal.communication_spine
          SET scroll_complete = TRUE,
              reviewed_by = current_setting('app.user_id', TRUE)::UUID,
              reviewed_at = NOW()
        WHERE id = $1`,
      [id],
    );
    return true;
  });

  if (updated) {
    await writeAudit({
      userId: user.id,
      role: user.accessLevel,
      action: "WELCOME_LETTER_READ",
      resourceType: "communication_spine",
      resourceId: id,
      newValues: { scrollComplete: true },
    });
  }

  const letter = await getWelcomeLetter(user, id);
  if (!letter) throw new NotFoundError("That letter doesn't exist, or it isn't one you can see.");
  return letter;
}

/**
 * Send. Refuses — loudly and exactly — unless the TL has read to the bottom.
 * This is the server-side half of the gate; the disabled button is only a
 * courtesy. A rule this load-bearing is never left to the browser.
 */
export async function sendWelcomeLetter(user: SessionUser, id: string): Promise<WelcomeLetter> {
  await requirePermission(user, "approve", "communication_spine");

  await withUserContext(user, async (q) => {
    const [row] = await q<{ id: string; scroll_complete: boolean; sent_at: string | null }>(
      `SELECT id, scroll_complete, sent_at::text AS sent_at
         FROM portal.communication_spine
        WHERE id = $1 AND letter_type = 'welcome_letter'`,
      [id],
    );
    if (!row) throw new NotFoundError("That letter doesn't exist, or it isn't one you can see.");
    if (row.sent_at) throw new BlockingRuleError("That letter has already been sent.");
    if (!row.scroll_complete) {
      throw new BlockingRuleError(
        "Read the letter to the end before sending it. The send button opens once you have scrolled to the bottom.",
      );
    }

    // Compare-and-swap: two tabs cannot both send the same letter to a family.
    const [sent] = await q<{ id: string }>(
      `UPDATE portal.communication_spine
          SET sent_at = NOW()
        WHERE id = $1 AND sent_at IS NULL AND scroll_complete
        RETURNING id`,
      [id],
    );
    if (!sent) throw new BlockingRuleError("That letter was sent by someone else a moment ago.");
    return sent;
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "WELCOME_LETTER_SENT",
    resourceType: "communication_spine",
    resourceId: id,
    newValues: { channel: "whatsapp" },
  });

  const letter = await getWelcomeLetter(user, id);
  if (!letter) throw new NotFoundError("That letter doesn't exist, or it isn't one you can see.");
  return letter;
}

export type WelcomeCounts = { total: number; awaitingRead: number; awaitingSend: number; sent: number; breached: number };

/** Roll the board up into the headline numbers. Pure. */
export function welcomeCounts(rows: WelcomeLetter[]): WelcomeCounts {
  let awaitingRead = 0;
  let awaitingSend = 0;
  let sent = 0;
  let breached = 0;
  for (const r of rows) {
    if (r.status === "sent") sent += 1;
    else if (r.status === "read") awaitingSend += 1;
    else awaitingRead += 1;
    if (r.slaBreached) breached += 1;
  }
  return { total: rows.length, awaitingRead, awaitingSend, sent, breached };
}

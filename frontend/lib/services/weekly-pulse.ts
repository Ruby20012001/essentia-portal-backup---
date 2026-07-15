import { query, withUserContext, type UserContext } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Weekly Pulse (Brief §26/§36 · Velocity Gate #2). "Every Friday, every active
 * project, the portal drafts the 3-line update and the CRM TL reviews and sends."
 * The draft is a portal.communication_spine row (letter_type='weekly_pulse'); the
 * TL review + scroll-gate + send flow is a separate surface. Here: the Friday
 * auto-draft job, plus the read board for /communication.
 */

export type PulseStatus = "sent" | "reviewed" | "draft" | "missing";

export type WeeklyPulseRow = {
  projectId: string;
  projectCode: string;
  projectName: string | null;
  familyName: string;
  phase: string;
  status: PulseStatus;
  draftPreview: string | null;
  sentAt: string | null;
};

/** Humanise a project_phase enum ('design_development' → 'Design development'). */
function phaseLabel(phase: string): string {
  const s = phase.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The 3-line auto-draft (Brief §36). A skeleton the CRM TL personalises before send. */
export function buildPulseDraft(p: { projectCode: string; familyName: string; phase: string }): string {
  return (
    `Dear ${p.familyName}, your Friday update on ${p.projectCode}.\n` +
    `• Stage: ${phaseLabel(p.phase)} — the team progressed as planned this week.\n` +
    `• Next: the upcoming milestone is on track; we'll share your next Pulse this Friday.`
  );
}

/**
 * The auto-pilot's Friday job. For every active project with no weekly_pulse this
 * ISO week, insert a draft. Runs org-wide (owner role, no RLS) so every project is
 * covered. No-ops off-Friday unless `force` (dev/manual verification).
 */
export async function draftWeeklyPulses(
  _actor: SessionUser,
  opts: { force?: boolean } = {},
): Promise<{ drafted: number; skipped?: string }> {
  const isFriday = new Date().getDay() === 5; // 0=Sun … 5=Fri
  if (!opts.force && !isFriday) return { drafted: 0, skipped: "not Friday" };

  const projects = await query<{
    id: string;
    project_code: string;
    family_id: string;
    current_phase: string;
    family_name: string;
  }>(
    `SELECT p.id, p.project_code, p.family_id, p.current_phase::text AS current_phase,
            f.primary_contact AS family_name
     FROM ee.projects p
     JOIN public.families f ON f.id = p.family_id
     WHERE p.is_active
       AND NOT EXISTS (
         SELECT 1 FROM portal.communication_spine cs
         WHERE cs.project_id = p.id AND cs.letter_type = 'weekly_pulse'
           AND date_trunc('week', cs.created_at) = date_trunc('week', CURRENT_DATE))
     ORDER BY p.project_code`,
  );

  for (const p of projects) {
    const draft = buildPulseDraft({ projectCode: p.project_code, familyName: p.family_name, phase: p.current_phase });
    await query(
      `INSERT INTO portal.communication_spine
         (project_id, family_id, letter_type, trigger_event, ai_draft, ai_model, ai_generated_at, channel)
       VALUES ($1, $2, 'weekly_pulse', 'friday_auto_draft', $3, 'template', NOW(), 'whatsapp')`,
      [p.id, p.family_id, draft],
    );
  }
  return { drafted: projects.length };
}

/** This week's pulse status per active project — RLS-scoped to the viewer. */
export async function listWeeklyPulses(user: UserContext): Promise<WeeklyPulseRow[]> {
  const rows = await withUserContext(user, (q) =>
    q<{
      project_id: string;
      project_code: string;
      project_name: string | null;
      family_name: string;
      phase: string;
      sent_at: string | null;
      reviewed_at: string | null;
      draft: string | null;
    }>(
      `SELECT p.id AS project_id, p.project_code, p.project_name,
              f.primary_contact AS family_name, p.current_phase::text AS phase,
              cs.sent_at::text AS sent_at, cs.reviewed_at::text AS reviewed_at,
              COALESCE(cs.final_content, cs.ai_draft) AS draft
       FROM ee.projects p
       JOIN public.families f ON f.id = p.family_id
       LEFT JOIN LATERAL (
         SELECT c.sent_at, c.reviewed_at, c.final_content, c.ai_draft
         FROM portal.communication_spine c
         WHERE c.project_id = p.id AND c.letter_type = 'weekly_pulse'
           AND date_trunc('week', c.created_at) = date_trunc('week', CURRENT_DATE)
         ORDER BY c.created_at DESC LIMIT 1
       ) cs ON TRUE
       WHERE p.is_active
       ORDER BY (cs.sent_at IS NOT NULL), (cs.ai_draft IS NOT NULL), p.project_code`,
    ),
  );

  return rows.map((r) => {
    const status: PulseStatus = r.sent_at
      ? "sent"
      : r.reviewed_at
        ? "reviewed"
        : r.draft
          ? "draft"
          : "missing";
    return {
      projectId: r.project_id,
      projectCode: r.project_code,
      projectName: r.project_name,
      familyName: r.family_name,
      phase: phaseLabel(r.phase),
      status,
      draftPreview: r.draft,
      sentAt: r.sent_at,
    };
  });
}

export type PulseCounts = { active: number; sent: number; drafted: number; missing: number };

/** Roll the board up into the headline numbers. Pure. */
export function pulseCounts(rows: WeeklyPulseRow[]): PulseCounts {
  let sent = 0;
  let drafted = 0;
  let missing = 0;
  for (const r of rows) {
    if (r.status === "sent") sent += 1;
    else if (r.status === "missing") missing += 1;
    else drafted += 1; // draft or reviewed-not-sent
  }
  return { active: rows.length, sent, drafted, missing };
}

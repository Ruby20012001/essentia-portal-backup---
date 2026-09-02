import { query } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Exit protocol (permanent constraint; Brief §36 · Velocity Gate #4).
 * "Exit protocol fires at exactly 11:59pm — all 6 removal actions simultaneously."
 *
 * HONESTY RULE (Brief §38, Rahul's critique — the silent-partial-failure mode):
 * an action is only reported `completed` when this portal actually performed it.
 * The five actions that need an external integration (Graph / WhatsApp Cloud API
 * / telephony) are recorded `not_wired` with the integration named — never
 * silently skipped and never reported as done. The board surfaces that, so a
 * departing person is never assumed removed when they are not.
 */

/**
 * Stored statuses are completed | partial | not_wired | failed (db/023 CHECK).
 * `pending` is read-model only: an exit whose 11:59pm protocol has not fired yet.
 */
export type ExitActionStatus = "completed" | "partial" | "not_wired" | "failed" | "pending";

export type ExitAction = {
  code: string;
  label: string;
  status: ExitActionStatus;
  detail: string | null;
};

/** The six removal actions, in the order the brief lists them. */
export const EXIT_ACTIONS: Array<{ code: string; label: string }> = [
  { code: "approval_authority_revoked", label: "Approval authority revoked (WO / PO)" },
  { code: "sso_revoked", label: "SSO revoked" },
  { code: "teams_channels_removed", label: "Teams channels removed" },
  { code: "whatsapp_groups_removed", label: "WhatsApp groups removed" },
  { code: "email_autoresponder_activated", label: "Email auto-responder activated" },
  { code: "call_forwarding_activated", label: "Phone call forwarding activated" },
];

/** Integrations each action depends on — absent here means the portal can do it itself. */
const NEEDS_INTEGRATION: Record<string, string> = {
  teams_channels_removed: "Microsoft Graph",
  whatsapp_groups_removed: "WhatsApp Cloud API",
  email_autoresponder_activated: "Microsoft Graph",
  call_forwarding_activated: "Telephony provider",
};

type DueExit = { id: string; full_name: string; exit_date: string };

/**
 * The 11:59pm sweep. Fires for every user whose exit_date has arrived and whose
 * protocol has not yet fired. All six actions are recorded for each exit.
 * Idempotent: exit_protocol_fired guards the sweep, and the action rows are
 * UNIQUE per (user, exit_date, action).
 */
export async function fireExitProtocol(
  actor: SessionUser,
  opts: { force?: boolean } = {},
): Promise<{ fired: number; names: string[] }> {
  const due = await query<DueExit>(
    `SELECT id, full_name, exit_date::text AS exit_date
     FROM public.users
     WHERE exit_date IS NOT NULL
       AND exit_date <= CURRENT_DATE
       AND NOT exit_protocol_fired
     ORDER BY exit_date, full_name`,
  );
  void opts; // the daily 23:59 slot IS the gate; force exists for parity with dev triggers

  for (const user of due) {
    await fireForUser(actor, user);
  }
  return { fired: due.length, names: due.map((u) => u.full_name) };
}

async function fireForUser(actor: SessionUser, user: DueExit): Promise<void> {
  // The actions this portal can genuinely perform, now.
  // Deactivating the account is what actually revokes approval authority: an
  // inactive user fails permission resolution and cannot act on any workflow.
  await query(`UPDATE public.users SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [user.id]);

  const revoked = await query<{ id: string }>(
    `UPDATE portal.sessions
     SET revoked_at = NOW(), revoked_reason = 'exit'
     WHERE user_id = $1 AND revoked_at IS NULL
     RETURNING id`,
    [user.id],
  );

  const [pending] = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
     FROM portal.workflow_tasks t
     JOIN portal.workflow_instances i ON i.id = t.instance_id AND i.status = 'pending'
     WHERE t.status = 'pending' AND t.group_no = i.current_step
       AND COALESCE(t.delegated_to_user_id, t.assignee_user_id) = $1`,
    [user.id],
  );
  const stalled = pending?.n ?? 0;

  const results: ExitAction[] = EXIT_ACTIONS.map((a) => {
    const integration = NEEDS_INTEGRATION[a.code];
    if (integration) {
      return {
        ...a,
        status: "not_wired" as const,
        detail: `Requires the ${integration} integration — not configured, so this removal has NOT happened.`,
      };
    }
    if (a.code === "approval_authority_revoked") {
      return {
        ...a,
        status: "completed" as const,
        detail:
          `Account deactivated — no further approvals possible.` +
          (stalled > 0 ? ` ${stalled} pending approval${stalled === 1 ? "" : "s"} need reassignment.` : ""),
      };
    }
    // sso_revoked — portal side done, identity provider still needs Graph.
    return {
      ...a,
      status: "partial" as const,
      detail: `Portal access revoked (${revoked.length} session${revoked.length === 1 ? "" : "s"} killed). Entra ID sign-in revocation requires Microsoft Graph — not configured.`,
    };
  });

  for (const r of results) {
    await query(
      `INSERT INTO portal.exit_protocol_actions (user_id, exit_date, action_code, status, detail)
       VALUES ($1, $2::date, $3, $4, $5)
       ON CONFLICT (user_id, exit_date, action_code) DO NOTHING`,
      [user.id, user.exit_date, r.code, r.status, r.detail],
    );
  }

  await query(
    `UPDATE public.users SET exit_protocol_fired = TRUE, exit_protocol_at = NOW() WHERE id = $1`,
    [user.id],
  );

  await writeAudit({
    userId: actor.id,
    role: actor.accessLevel,
    action: "EXIT_PROTOCOL_FIRED",
    resourceType: "users",
    resourceId: user.id,
    newValues: {
      exitDate: user.exit_date,
      sessionsRevoked: revoked.length,
      pendingApprovalsStalled: stalled,
      actions: results.map((r) => ({ code: r.code, status: r.status })),
    },
  });
}

export type ExitRow = {
  userId: string;
  name: string;
  jobTitle: string | null;
  exitDate: string;
  fired: boolean;
  firedAt: string | null;
  actions: ExitAction[];
};

/** Exits and their protocol log — for the Exit Protocol board (people data: L0/L1). */
export async function listExits(): Promise<ExitRow[]> {
  const users = await query<{
    id: string;
    full_name: string;
    job_title: string | null;
    exit_date: string;
    exit_protocol_fired: boolean;
    exit_protocol_at: string | null;
  }>(
    `SELECT id, full_name, job_title, exit_date::text AS exit_date,
            exit_protocol_fired, exit_protocol_at::text AS exit_protocol_at
     FROM public.users
     WHERE exit_date IS NOT NULL
     ORDER BY exit_date DESC, full_name`,
  );
  if (users.length === 0) return [];

  const logged = await query<{
    user_id: string;
    action_code: string;
    status: ExitActionStatus;
    detail: string | null;
  }>(
    `SELECT user_id, action_code, status, detail
     FROM portal.exit_protocol_actions
     WHERE user_id = ANY($1::uuid[])`,
    [users.map((u) => u.id)],
  );

  return users.map((u) => {
    const mine = logged.filter((l) => l.user_id === u.id);
    const actions: ExitAction[] = EXIT_ACTIONS.map((a) => {
      const hit = mine.find((m) => m.action_code === a.code);
      return hit
        ? { ...a, status: hit.status, detail: hit.detail }
        : { ...a, status: "pending" as const, detail: "Scheduled to fire at 11:59pm on the exit date." };
    });
    return {
      userId: u.id,
      name: u.full_name,
      jobTitle: u.job_title,
      exitDate: u.exit_date,
      fired: u.exit_protocol_fired,
      firedAt: u.exit_protocol_at,
      actions,
    };
  });
}

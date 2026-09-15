import { query, withTransaction } from "@/lib/db";
import { getConfig } from "@/lib/services/config";
import { writeAudit } from "@/lib/services/audit";
import { sendMail } from "@/lib/mail/send";
import { getPublicBoard } from "@/lib/services/wio-tracker";
import {
  ALARM2,
  alarm2Due,
  renderAlarm2Email,
} from "@/lib/services/wio-tracker-alarm-mail";

/**
 * The daily ALARM 2 email run (db/049). Called by Vercel Cron through
 * app/api/wio-tracker/alarms/run, never by a person.
 *
 *   1. Off unless tracker.alarm2.email_enabled is true and a recipient is set.
 *   2. Reads the board exactly as the public link does — same rows, same pure
 *      derivation — so the email can never name a WIO the board does not.
 *   3. Picks the escalated WIOs not already emailed successfully.
 *   4. Sends ONE email naming them all, and records the outcome per WIO.
 *
 * A refusal from the mail service is recorded as 'failed' with its reason and
 * retried the next day; only a 'sent' row stops a WIO being mailed again (a
 * partial unique index enforces that in the database, not just here).
 */

export type Alarm2RunResult =
  | { status: "disabled" }
  | { status: "no_recipient" }
  | { status: "nothing_due" }
  | {
      status: "sent" | "failed" | "not_configured";
      recipient: string;
      boardDate: string;
      wios: string[];
      detail?: string;
    };

export async function runAlarm2Emails(boardUrl: string): Promise<Alarm2RunResult> {
  const enabled = await getConfig<boolean>("tracker.alarm2.email_enabled", false);
  if (enabled !== true) return { status: "disabled" };

  const recipient = String(await getConfig<string>("tracker.alarm2.recipient", "")).trim();
  if (!recipient) return { status: "no_recipient" };

  const board = await getPublicBoard();
  const sent = await query<{ wio_id: string }>(
    `SELECT wio_id FROM ee.tracker_alarm_emails WHERE alarm = $1 AND status = 'sent'`,
    [ALARM2],
  );
  const due = alarm2Due(board.wios, new Set(sent.map((r) => r.wio_id)));
  if (due.length === 0) return { status: "nothing_due" };

  const teamNames = Object.fromEntries(board.teams.map((t) => [t.code, t.name]));
  const mail = renderAlarm2Email(due, board.settings, boardUrl, teamNames);
  const result = await sendMail({ to: recipient, toName: "Hardesh", ...mail });

  const status: "sent" | "failed" | "not_configured" = result.ok
    ? "sent"
    : result.reason === "not_configured"
      ? "not_configured"
      : "failed";
  const detail = result.ok ? null : result.detail;

  await withTransaction(async (q) => {
    for (const w of due) {
      await q(
        `INSERT INTO ee.tracker_alarm_emails (wio_id, alarm, recipient, board_date, status, detail)
         VALUES ($1, $2, $3, $4::date, $5, $6)
         ON CONFLICT (wio_id, alarm) WHERE status = 'sent' DO NOTHING`,
        [w.id, ALARM2, recipient, board.settings.today, status, detail],
      );
    }
  });

  await writeAudit({
    action: "WIO_TRACKER_ALARM2_EMAIL",
    resourceType: "wio_tracker",
    newValues: {
      recipient,
      status,
      boardDate: board.settings.today,
      wios: due.map((w) => w.wio),
      detail,
    },
  });

  return {
    status,
    recipient,
    boardDate: board.settings.today,
    wios: due.map((w) => w.wio),
    ...(detail ? { detail } : {}),
  };
}

import { query } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";

/**
 * In-app inbox — the READ side consumed by the Notification Center. The WRITE
 * side moved to the event framework (lib/notifications): modules publish
 * events, the engine's in-app channel populates portal.notifications. Nothing
 * here sends notifications.
 */

/** {{var}} substitution; unknown placeholders stay visible for debugging. */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    key in vars ? String(vars[key]) : `{{${key}}}`,
  );
}

export type Notification = {
  id: string;
  tier: "urgent" | "action_required" | "informational";
  category: string | null;
  notificationType: string | null;
  title: string;
  body: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export type NotificationFilter = {
  status?: "all" | "unread" | "read" | "archived";
  category?: string;
  search?: string;
  limit?: number;
};

const SELECT = `
  SELECT id, tier, category, notification_type, title, body, action_url,
         action_label, read_at::TEXT, acknowledged_at::TEXT, archived_at::TEXT,
         created_at::TEXT
  FROM portal.notifications`;

function toNotification(r: {
  id: string; tier: Notification["tier"]; category: string | null;
  notification_type: string | null; title: string; body: string | null;
  action_url: string | null; action_label: string | null; read_at: string | null;
  acknowledged_at: string | null; archived_at: string | null; created_at: string;
}): Notification {
  return {
    id: r.id, tier: r.tier, category: r.category, notificationType: r.notification_type,
    title: r.title, body: r.body, actionUrl: r.action_url, actionLabel: r.action_label,
    readAt: r.read_at, acknowledgedAt: r.acknowledged_at, archivedAt: r.archived_at,
    createdAt: r.created_at,
  };
}

export async function listNotifications(
  user: SessionUser,
  filter: NotificationFilter = {},
): Promise<Notification[]> {
  const conds: string[] = ["recipient_id = $1", "dismissed_at IS NULL"];
  const params: unknown[] = [user.id];

  const status = filter.status ?? "all";
  if (status === "unread") conds.push("read_at IS NULL", "archived_at IS NULL");
  else if (status === "read") conds.push("read_at IS NOT NULL", "archived_at IS NULL");
  else if (status === "archived") conds.push("archived_at IS NOT NULL");
  else conds.push("archived_at IS NULL");

  if (filter.category) {
    params.push(filter.category);
    conds.push(`category = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    conds.push(`(title ILIKE $${params.length} OR body ILIKE $${params.length})`);
  }
  params.push(filter.limit ?? 50);

  const rows = await query<Parameters<typeof toNotification>[0]>(
    `${SELECT} WHERE ${conds.join(" AND ")} ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(toNotification);
}

export async function unreadCount(user: SessionUser): Promise<number> {
  const [row] = await query<{ n: number }>(
    `SELECT COUNT(*)::INT AS n FROM portal.notifications
     WHERE recipient_id = $1 AND read_at IS NULL
       AND dismissed_at IS NULL AND archived_at IS NULL`,
    [user.id],
  );
  return row.n;
}

export async function markRead(user: SessionUser, id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE portal.notifications SET read_at = NOW()
     WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL RETURNING id`,
    [id, user.id],
  );
  return rows.length > 0;
}

export async function markAllRead(user: SessionUser): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE portal.notifications SET read_at = NOW()
     WHERE recipient_id = $1 AND read_at IS NULL AND archived_at IS NULL RETURNING id`,
    [user.id],
  );
  return rows.length;
}

export async function archiveNotification(user: SessionUser, id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE portal.notifications SET archived_at = NOW(),
       read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND recipient_id = $2 AND archived_at IS NULL RETURNING id`,
    [id, user.id],
  );
  return rows.length > 0;
}

export async function acknowledgeNotification(user: SessionUser, id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE portal.notifications SET acknowledged_at = NOW(),
       read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND recipient_id = $2 AND acknowledged_at IS NULL RETURNING id`,
    [id, user.id],
  );
  return rows.length > 0;
}

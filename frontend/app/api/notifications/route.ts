import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listNotifications, unreadCount } from "@/lib/services/notifications";
import { toErrorResponse } from "@/lib/api/errors";
import type { NotificationFilter } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

/** Notification Center feed: ?status=all|unread|read|archived&category=&q= */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const sp = request.nextUrl.searchParams;
    const status = (sp.get("status") ?? undefined) as NotificationFilter["status"];
    const filter: NotificationFilter = {
      status,
      category: sp.get("category") ?? undefined,
      search: sp.get("q") ?? undefined,
    };
    const [notifications, unread] = await Promise.all([
      listNotifications(user, filter),
      unreadCount(user),
    ]);
    return NextResponse.json({ notifications, unread });
  } catch (error) {
    return toErrorResponse(error);
  }
}

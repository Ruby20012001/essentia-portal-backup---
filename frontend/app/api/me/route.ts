import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserById } from "@/lib/services/users";
import { unreadCount } from "@/lib/services/notifications";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getCurrentUser();
    const [user, unread] = await Promise.all([
      getUserById(session.id),
      unreadCount(session),
    ]);
    return NextResponse.json({ user, unreadNotifications: unread });
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { unreadCount } from "@/lib/services/notifications";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Current session, or 401. Used by the client to know who is signed in. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({
      user: session.user,
      unreadNotifications: await unreadCount(session.user),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

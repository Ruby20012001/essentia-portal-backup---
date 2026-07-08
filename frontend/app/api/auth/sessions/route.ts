import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { listUserSessions } from "@/lib/auth/sessions";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** The user's own active sessions (concurrent-session control / device list). */
export async function GET() {
  try {
    const { user, sessionId } = await getCurrentSession();
    const sessions = await listUserSessions(user, sessionId);
    return NextResponse.json({ sessions });
  } catch (error) {
    return toErrorResponse(error);
  }
}

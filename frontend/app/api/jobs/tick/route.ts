import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { runDueJobs } from "@/lib/services/scheduler";
import { toErrorResponse } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/errors";

export const dynamic = "force-dynamic";

/**
 * The auto-pilot tick. An external cron (EventBridge / GitHub Actions / system
 * cron) calls this every minute; it evaluates due jobs and runs them, with
 * single-fire locking in the DB. Auth: when SCHEDULER_TICK_SECRET is set the
 * caller must present it in x-scheduler-token; otherwise (dev) an authenticated
 * session is required. This fails loud in production — no secret, no anonymous tick.
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.SCHEDULER_TICK_SECRET;
    if (secret) {
      if (request.headers.get("x-scheduler-token") !== secret) throw new AuthError();
    } else {
      await getCurrentUser();
    }
    return NextResponse.json(await runDueJobs("scheduler"));
  } catch (error) {
    return toErrorResponse(error);
  }
}

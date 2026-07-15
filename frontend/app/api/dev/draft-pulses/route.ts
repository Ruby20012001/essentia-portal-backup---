import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { draftWeeklyPulses } from "@/lib/services/weekly-pulse";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * DEV ONLY — force the Weekly Pulse auto-draft to run now, bypassing the
 * Friday gate, so the Gate #2 flow can be exercised any day. Gated by
 * AUTH_ALLOW_DEV_LOGIN (404s in production). The real cadence is the daily
 * 'weekly-pulse-draft' job, which only drafts on Fridays.
 */
export async function POST() {
  if (process.env.AUTH_ALLOW_DEV_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const user = await getCurrentUser();
    const result = await draftWeeklyPulses(user, { force: true });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

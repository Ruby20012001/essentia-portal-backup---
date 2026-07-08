import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { sweepWioClock } from "@/lib/services/wio";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * WIO clock escalation sweep (Brief §30: day-12 alert / day-15 lapse),
 * deduped per WIO per day. The auto-pilot scheduler will own the cadence;
 * until then this endpoint is invoked manually or by cron.
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    const result = await sweepWioClock(user);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

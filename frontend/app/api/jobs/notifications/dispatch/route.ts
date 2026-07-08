import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { processDueDeliveries } from "@/lib/notifications";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Delivery retry processor — attempts due pending deliveries (backoff
 * elapsed / quiet-hours ended), applying exponential backoff and moving
 * exhausted ones to the dead-letter state. The auto-pilot scheduler will
 * own the cadence (A-14); until then cron/ops calls this.
 */
export async function POST() {
  try {
    await getCurrentUser();
    return NextResponse.json(await processDueDeliveries());
  } catch (error) {
    return toErrorResponse(error);
  }
}

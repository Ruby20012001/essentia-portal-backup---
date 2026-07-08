import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getConfig } from "@/lib/services/config";
import { runKekaSync } from "@/lib/integrations/keka/sync";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Scheduled org sync (trigger_type='scheduled'). The auto-pilot scheduler
 * will own the cadence (A-14); until then this is invoked by cron/ops. Honors
 * the keka.sync_enabled master switch.
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!(await getConfig<boolean>("keka.sync_enabled", true))) {
      return NextResponse.json({ skipped: true, reason: "keka.sync_enabled is false" });
    }
    const result = await runKekaSync(user, "scheduled");
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getLatestSyncRuns } from "@/lib/integrations/keka/sync";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Recent sync runs with stats (sync audit log surface). L0/L1 only. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ runs: await getLatestSyncRuns(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

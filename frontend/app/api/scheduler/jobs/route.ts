import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listJobs } from "@/lib/services/scheduler";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Scheduler status — registered jobs + recent runs. Read-gated (resource 'scheduler'). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await listJobs(user));
  } catch (error) {
    return toErrorResponse(error);
  }
}

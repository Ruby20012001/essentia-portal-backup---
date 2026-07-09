import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listMyApprovals } from "@/lib/services/workflow-inbox";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** The current user's actionable pending approvals (their own inbox). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ approvals: await listMyApprovals(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

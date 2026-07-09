import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkflowDetail } from "@/lib/services/workflow-detail";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/** Workflow timeline — the approval chain + history for one instance (read-only). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const bad = invalidId(params.id);
  if (bad) return bad;
  try {
    const user = await getCurrentUser();
    const detail = await getWorkflowDetail(user, params.id);
    if (!detail) return NextResponse.json({ error: "Workflow instance not found" }, { status: 404 });
    return NextResponse.json({ detail });
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkflowAdvisory } from "@/lib/services/workflow-advisory";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/**
 * Read-only AI advisory for an approver — deterministic SLA risk + an optional
 * AI summary/anomaly flag. Advisory only (WES §13): never changes state.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const bad = invalidId(params.id);
  if (bad) return bad;
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await getWorkflowAdvisory(user, params.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}

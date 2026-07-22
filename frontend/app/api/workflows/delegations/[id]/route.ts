import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/services/permissions";
import { getDelegationDetail } from "@/lib/services/workflow-delegations";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/**
 * Read-only delegation detail for the admin Active Delegations drawer. Gated to
 * assign:workflows (leadership / platform admin) — the same authority that may
 * revoke a delegation. Aggregates existing data only; writes nothing.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const bad = invalidId(params.id);
  if (bad) return bad;
  try {
    const user = await getCurrentUser();
    await requirePermission(user, "assign", "workflows");
    const detail = await getDelegationDetail(params.id);
    if (!detail) {
      return NextResponse.json({ error: "Delegation not found." }, { status: 404 });
    }
    return NextResponse.json({ detail });
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listAuditEntries } from "@/lib/services/audit-query";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Audit trail read — permission-gated (matrix: L0/L1 only). */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const entries = await listAuditEntries(user, {
      resourceType: request.nextUrl.searchParams.get("resourceType") ?? undefined,
      resourceId: request.nextUrl.searchParams.get("resourceId") ?? undefined,
    });
    return NextResponse.json({ entries });
  } catch (error) {
    return toErrorResponse(error);
  }
}

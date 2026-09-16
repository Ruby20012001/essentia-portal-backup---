import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { setRoleStatus, type RoleStatus } from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const STATUSES: RoleStatus[] = ["open", "on_hold", "filled", "closed"];

/** Open, hold, fill or close a seat. Nothing about a seat is deleted. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as { status?: string };
    if (!body.status || !STATUSES.includes(body.status as RoleStatus)) {
      return NextResponse.json(
        { error: `A seat is one of: ${STATUSES.join(", ")}.` },
        { status: 400 },
      );
    }
    await setRoleStatus(user, params.id, body.status as RoleStatus);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

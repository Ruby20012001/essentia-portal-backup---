import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { approveDiscount } from "@/lib/services/eh";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/**
 * Velocity Gate 5 — the Country Head's discount sign-off. Refuses with the
 * exact blocking message (422) when there is nothing to approve, when the
 * discount sits below the centre's threshold, or when someone else approved
 * it first.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const result = await approveDiscount(user, params.id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

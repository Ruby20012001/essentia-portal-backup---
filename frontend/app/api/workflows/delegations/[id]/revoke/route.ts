import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { revokeDelegation } from "@/lib/services/workflow-delegations";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/** Revoke a standing delegation (the delegator or an admin). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const bad = invalidId(params.id);
  if (bad) return bad;
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await revokeDelegation(user, params.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}

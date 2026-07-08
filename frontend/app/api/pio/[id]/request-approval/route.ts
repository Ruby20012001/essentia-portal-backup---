import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requestPioApproval } from "@/lib/services/pio";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/** The §29 Triangle gate — then hands the PIO to the approval chain. */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const pio = await requestPioApproval(user, params.id);
    return NextResponse.json({ pio }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

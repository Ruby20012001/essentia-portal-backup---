import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { convertWioToPio } from "@/lib/services/wio";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/** The §30 gate — refuses with the exact blocking message when incomplete. */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const result = await convertWioToPio(user, params.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

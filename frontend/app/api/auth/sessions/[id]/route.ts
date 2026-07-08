import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { revokeSessionById } from "@/lib/auth/sessions";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/** Sign out one of your own devices. */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const revoked = await revokeSessionById(user, params.id);
    if (!revoked) {
      return NextResponse.json(
        { error: "Session not found, already ended, or not yours" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

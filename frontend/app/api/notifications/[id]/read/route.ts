import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { markRead } from "@/lib/services/notifications";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const updated = await markRead(user, params.id);
    if (!updated) {
      return NextResponse.json(
        { error: "Notification not found, already read, or not yours" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

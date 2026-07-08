import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { acknowledgeNotification } from "@/lib/services/notifications";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const bad = invalidId(params.id);
  if (bad) return bad;
  try {
    const user = await getCurrentUser();
    const ok = await acknowledgeNotification(user, params.id);
    if (!ok) return NextResponse.json({ error: "Not found or already acknowledged" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

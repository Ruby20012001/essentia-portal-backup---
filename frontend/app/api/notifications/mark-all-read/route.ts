import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { markAllRead } from "@/lib/services/notifications";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ marked: await markAllRead(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

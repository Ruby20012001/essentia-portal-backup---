import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listPios } from "@/lib/services/pio";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ pios: await listPios(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

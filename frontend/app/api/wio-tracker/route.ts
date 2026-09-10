import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getBoard } from "@/lib/services/wio-tracker";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * S4b · the whole WIO → PIO Tracker board in one read — settings, chain, the
 * computed rows worst-first, the Today roll-ups, delays and the dropdown
 * sources. One request because every screen needs the same derived board and
 * the client must never recompute a status a second way.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await getBoard(user));
  } catch (error) {
    return toErrorResponse(error);
  }
}

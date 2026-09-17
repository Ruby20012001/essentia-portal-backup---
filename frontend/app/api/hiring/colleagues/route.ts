import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { searchHiringColleagues } from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Colleagues for a panel or a hiring lead — including the person searching,
 * who is very often the one holding the conversation. Kept under /api/hiring
 * rather than widening /api/users, so a deployment that serves hiring serves
 * everything hiring needs from one prefix.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const q = request.nextUrl.searchParams.get("q") ?? "";
    return NextResponse.json({ users: await searchHiringColleagues(user, q) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

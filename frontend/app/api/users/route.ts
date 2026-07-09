import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { searchColleagues } from "@/lib/services/users";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Colleague search for pickers (e.g. choosing a delegate). Session-gated. */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const q = request.nextUrl.searchParams.get("q") ?? "";
    if (q.trim().length < 2) return NextResponse.json({ users: [] });
    return NextResponse.json({ users: await searchColleagues(q, user.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

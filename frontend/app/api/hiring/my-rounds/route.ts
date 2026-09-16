import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listMyRounds } from "@/lib/services/hiring";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Every round this person is sitting in. The one read in the module that does
 * not need hr_access — the panel list is the permission, and the row fence
 * hands back only the rounds they are on.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ rounds: await listMyRounds(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

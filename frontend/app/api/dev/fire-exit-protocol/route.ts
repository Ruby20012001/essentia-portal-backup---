import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { fireExitProtocol } from "@/lib/services/exit-protocol";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * DEV ONLY — run the exit-protocol sweep now instead of waiting for the 23:59
 * slot, so Gate #4 can be exercised. Gated by AUTH_ALLOW_DEV_LOGIN (404s in
 * production). Fires only for users whose exit_date has arrived and whose
 * protocol has not already fired — identical to the scheduled behaviour.
 */
export async function POST() {
  if (process.env.AUTH_ALLOW_DEV_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await fireExitProtocol(user, { force: true }));
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, revokeSessionByToken } from "@/lib/auth/sessions";
import { clearSessionCookie } from "@/lib/auth/cookie";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const token = cookies().get(SESSION_COOKIE)?.value;
    if (token) await revokeSessionByToken(token, "logout");
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

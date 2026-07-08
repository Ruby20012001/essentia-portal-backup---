import type { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";

/** Sets the session cookie: httpOnly, sameSite=lax, secure in production. */
export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: string,
): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

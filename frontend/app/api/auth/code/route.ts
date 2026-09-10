import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { createSession } from "@/lib/auth/sessions";
import { setSessionCookie } from "@/lib/auth/cookie";
import { requestSignInCode, verifySignInCode } from "@/lib/auth/signin-code";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp, userAgent } from "@/lib/api/request";
import { toErrorResponse } from "@/lib/api/errors";
import type { SessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ step: z.literal("send"), email: z.string().email() }),
  z.object({
    step: z.literal("verify"),
    email: z.string().email(),
    code: z.string().min(4).max(10),
  }),
]);

/**
 * Signing in with a code sent by email — one route, two steps.
 *
 * Both steps live here rather than in two files because they are one
 * conversation: ask, then answer. Splitting them would mean repeating the
 * throttling and the email normalisation in both, which is where the two would
 * eventually disagree.
 *
 * Throttled per address AND per IP:
 *   send   — 5 in 15 minutes. Sending is free to the requester and costs a real
 *            email; without a ceiling this is a way to flood somebody's inbox.
 *   verify — 10 in 5 minutes, on top of the five guesses the code itself
 *            allows. The per-code limit stops guessing one code; this stops
 *            asking for code after code and guessing each once.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request) ?? "unknown";
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "An email address is required." }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();

    if (parsed.data.step === "send") {
      const limit = rateLimit(`code-send:${email}:${ip}`, 5, 900);
      if (!limit.allowed) {
        return NextResponse.json(
          { error: "Too many codes requested. Please wait a few minutes." },
          { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
        );
      }

      const result = await requestSignInCode(email, ip === "unknown" ? null : ip);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      // Deliberately the same answer whether or not the account exists.
      return NextResponse.json({ ok: true });
    }

    const limit = rateLimit(`code-verify:${email}:${ip}`, 10, 300);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many tries. Please wait a few minutes." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const verified = await verifySignInCode(email, parsed.data.code);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: 401 });
    }

    const [user] = await query<SessionUser>(
      `SELECT id, full_name AS name, access_level AS "accessLevel",
              department_id AS "departmentId"
         FROM public.users WHERE id = $1`,
      [verified.userId],
    );
    if (!user) {
      return NextResponse.json({ error: "That account is no longer active." }, { status: 401 });
    }

    // The same session a password login makes — same lifetime, same idle
    // timeout, same concurrent-session cap. How someone proved who they are
    // does not change what the session is.
    const { token, expiresAt } = await createSession(user, "local", {
      userAgent: userAgent(request),
      ipAddress: ip === "unknown" ? null : ip,
    });

    const response = NextResponse.json({
      user: { id: user.id, name: user.name, accessLevel: user.accessLevel },
    });
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

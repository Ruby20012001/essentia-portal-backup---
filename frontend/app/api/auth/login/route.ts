import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActiveProvider } from "@/lib/auth";
import { createSession } from "@/lib/auth/sessions";
import { setSessionCookie } from "@/lib/auth/cookie";
import { writeAudit } from "@/lib/services/audit";
import { rateLimit, rateLimitReset } from "@/lib/security/rate-limit";
import { clientIp, userAgent } from "@/lib/api/request";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

/**
 * Credential login (local provider). Redirect providers (Entra) use
 * /api/auth/entra/* instead. Throttled per email+IP; a generic 401 on bad
 * credentials never reveals whether the account exists.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request) ?? "unknown";
  try {
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    const { email, password } = parsed.data;

    const limit = rateLimit(`login:${email.toLowerCase()}:${ip}`, 10, 300);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please wait and try again." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const provider = await getActiveProvider();
    if (provider.kind !== "credential") {
      return NextResponse.json(
        { error: `The active provider (${provider.name}) uses redirect sign-in, not password.` },
        { status: 400 },
      );
    }

    const user = await provider.authenticate({ email, password });
    if (!user) {
      await writeAudit({
        action: "LOGIN_FAILED",
        resourceType: "users",
        newValues: { email, ip },
      });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    rateLimitReset(`login:${email.toLowerCase()}:${ip}`);
    const { token, expiresAt } = await createSession(user, user.authProvider, {
      userAgent: userAgent(request),
      ipAddress: ip === "unknown" ? null : ip,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        accessLevel: user.accessLevel,
      },
    });
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

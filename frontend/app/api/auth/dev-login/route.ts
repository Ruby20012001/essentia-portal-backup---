import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getUserById } from "@/lib/services/users";
import { createSession } from "@/lib/auth/sessions";
import { setSessionCookie } from "@/lib/auth/cookie";
import { clientIp, userAgent } from "@/lib/api/request";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const schema = z
  .object({ userId: z.string().uuid().optional(), email: z.string().email().optional() })
  .refine((v) => v.userId || v.email, { message: "userId or email required" });

/**
 * DEV BOOTSTRAP — mints a real session for a seeded/synced user by id or
 * email, without a password. Gated by AUTH_ALLOW_DEV_LOGIN; 404 when off, so
 * it does not exist in production. Uses the same session machinery as login.
 */
export async function POST(request: NextRequest) {
  if (process.env.AUTH_ALLOW_DEV_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "userId (uuid) or email required" }, { status: 400 });
    }

    let userId = parsed.data.userId;
    if (!userId && parsed.data.email) {
      const [row] = await query<{ id: string }>(
        `SELECT id FROM public.users WHERE lower(email) = lower($1)`,
        [parsed.data.email],
      );
      userId = row?.id;
    }
    const user = userId ? await getUserById(userId) : null;
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "No such active user" }, { status: 404 });
    }

    const { token, expiresAt } = await createSession(
      { id: user.id, name: user.name, accessLevel: user.accessLevel, departmentId: user.departmentId },
      "dev",
      { userAgent: userAgent(request), ipAddress: clientIp(request) },
    );
    const response = NextResponse.json({
      user: { id: user.id, name: user.name, accessLevel: user.accessLevel },
    });
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { changeOwnPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/change-password";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/api/request";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

/**
 * Changing your own password. Yours only — there is no user id in the request,
 * so this endpoint cannot be pointed at somebody else's account however it is
 * called. An admin reset is a different thing and would need its own route and
 * its own permission.
 *
 * Throttled per session: the current password is required, so an unattended
 * signed-in screen is otherwise a place to guess it at leisure.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const ip = clientIp(request) ?? "unknown";
    const limit = rateLimit(`password-change:${session.user.id}:${ip}`, 5, 300);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait and try again." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: `A new password of at least ${MIN_PASSWORD_LENGTH} characters is required.` },
        { status: 400 },
      );
    }

    const result = await changeOwnPassword(
      session,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );

    if (!result.ok) {
      // 400, not 403: this is the account holder being told what to fix, not a
      // permission refusal.
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      otherSessionsEnded: result.otherSessionsEnded,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

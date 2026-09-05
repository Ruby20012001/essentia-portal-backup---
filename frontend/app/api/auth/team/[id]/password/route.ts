import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { resetColleaguePassword } from "@/lib/auth/team-reset";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/change-password";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/api/request";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const schema = z.object({
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

/**
 * A lead setting a colleague's password. The permission, the department scope
 * and the provider are all checked in the service — this route only carries the
 * request there, so the rules cannot be reached around by calling it directly.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const ip = clientIp(request) ?? "unknown";
    const limit = rateLimit(`team-reset:${session.user.id}:${ip}`, 10, 300);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many resets in a row. Please wait and try again." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: `A password of at least ${MIN_PASSWORD_LENGTH} characters is required.` },
        { status: 400 },
      );
    }

    const result = await resetColleaguePassword(
      session.user,
      params.id,
      parsed.data.newPassword,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      name: result.name,
      sessionsEnded: result.sessionsEnded,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

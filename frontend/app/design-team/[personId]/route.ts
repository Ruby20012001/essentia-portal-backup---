import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { createSession } from "@/lib/auth/sessions";
import { setSessionCookie } from "@/lib/auth/cookie";
import { writeAudit } from "@/lib/services/audit";
import { clientIp, userAgent } from "@/lib/api/request";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Pick your name, and you are in.
 *
 * Monica, 21 Sep 2026, asked for this in those words and was asked back, in
 * as many words, whether "click the name and straight in" or "click the name,
 * then your password". She chose the first, knowing what it means: WHOEVER
 * OPENS THE PAGE CAN ENTER UNDER ANY OF THE FIVE NAMES. There is no secret
 * here and this file does not pretend otherwise.
 *
 * WHY IT IS NOT SIMPLY A HOLE. Three things bound it, and all three matter:
 *
 *   · DESIGN_TEAM_NAME_SIGNIN must be "true". Unset, every route here is a
 *     404. Turning this on is a decision somebody makes for a deployment, not
 *     something that arrives with a deploy.
 *   · Only ee.design_tracker_people. The five on the design board and nobody
 *     else — an administrator, a founder, the WIO team cannot be picked,
 *     because they are not on that table. The worst this can do is what the
 *     five can do.
 *   · L2 and below. A designer's account is L3 and the head's L2; anything
 *     stronger is refused even if somebody is later added to that table with
 *     an admin account attached. The ceiling does not move when the list does.
 *
 * What it replaces was worse in practice, not better: five secret links that
 * had to be re-issued and re-sent every time, which meant they lived in chat
 * messages and were pasted about. A door everyone can see beats a key
 * everyone forwards.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { personId: string } },
) {
  if (process.env.DESIGN_TEAM_NAME_SIGNIN !== "true") {
    return new NextResponse("Not found", { status: 404 });
  }
  const ip = clientIp(request) ?? "unknown";
  try {
    const [row] = await query<{
      person_name: string;
      user_id: string | null;
      name: string | null;
      access_level: "L0" | "L1" | "L2" | "L3" | null;
      department_id: string | null;
      is_active: boolean | null;
    }>(
      `SELECT p.name AS person_name,
              u.id AS user_id,
              COALESCE(u.display_name, u.full_name) AS name,
              u.access_level, u.department_id, u.is_active
         FROM ee.design_tracker_people p
         LEFT JOIN public.users u ON u.id = p.user_id
        WHERE p.id = $1 AND p.is_active`,
      [params.personId],
    );

    if (!row) return new NextResponse("Not found", { status: 404 });
    if (!row.user_id || !row.is_active || !row.access_level) {
      return new NextResponse(
        `${row.person_name} does not have a portal account yet. Ask Monica to set one up.`,
        { status: 409 },
      );
    }
    /* The ceiling, checked here rather than trusted from the list above. */
    if (row.access_level === "L0" || row.access_level === "L1") {
      return new NextResponse("Not found", { status: 404 });
    }

    const user = {
      id: row.user_id,
      name: row.name ?? row.person_name,
      accessLevel: row.access_level,
      departmentId: row.department_id,
    };
    const { token, expiresAt } = await createSession(user, "design-team", {
      userAgent: userAgent(request),
      ipAddress: ip === "unknown" ? null : ip,
    });

    /* Against users, not design_tracker: the board's activity feed answers
       "what was done to my projects", and five arrivals a morning would bury
       the two lines that say it. */
    await writeAudit({
      userId: user.id,
      action: "LOGIN",
      resourceType: "users",
      resourceId: user.id,
      newValues: { via: "design-team-page", person: row.person_name, ip },
    });

    const response = NextResponse.redirect(new URL("/design-tracker", request.nextUrl.origin));
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

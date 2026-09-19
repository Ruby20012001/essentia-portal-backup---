import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { createSession } from "@/lib/auth/sessions";
import { setSessionCookie } from "@/lib/auth/cookie";
import { writeAudit } from "@/lib/services/audit";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp, userAgent } from "@/lib/api/request";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * One link per person — the design team's way in.
 *
 * Monica, 19 Sep 2026: "baki sabke alag alag portal banao concept deck ki
 * tarah". The five do not use the portal for anything else, and a password
 * between a designer and her own board is the reason the board went untouched.
 * So each of them has a link, the way each deck is a link, and opening it is
 * the whole of signing in.
 *
 * WHAT THIS IS NOT. It is not a way to become somebody of your choosing. The
 * link carries a secret that was issued for exactly one row on
 * ee.design_tracker_people (db/053) and resolves to that person's own account;
 * there is no name in the URL to change. What the holder may then do is
 * whatever that account may do, decided where it is decided for everybody
 * else — the tracker's own rules. A designer gets her own projects. The head
 * gets a board she can read. Neither gets anything by holding a link that she
 * would not get by typing her password.
 *
 * It issues an ordinary session, deliberately: every write still goes through
 * the same endpoints, calling the same checks, reading the same session. There
 * is no second code path in which a rule could be forgotten.
 *
 * THE TRADE, SAID PLAINLY. Anyone who has a designer's link can tick her work
 * off as her. Monica chose that twice, for an internal board where a wrong
 * tick appears in the activity feed under her name and can be undone. A link
 * that goes astray is retired by re-running db/mint-design-links.mjs, which
 * revokes the old row; the account itself is untouched.
 *
 * Guessing is not the way in either: the secret is 32 random bytes, only its
 * sha256 is stored, and attempts are throttled per address.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  const ip = clientIp(request) ?? "unknown";
  try {
    const limit = rateLimit(`tracker-link:${ip}`, 20, 300);
    if (!limit.allowed) {
      return new NextResponse("Too many attempts. Please wait and try again.", {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      });
    }

    const secret = params.token ?? "";
    const tokenHash = createHash("sha256").update(secret).digest("hex");

    const [row] = await query<{
      link_id: string;
      person_name: string;
      user_id: string | null;
      name: string | null;
      access_level: "L0" | "L1" | "L2" | "L3" | null;
      department_id: string | null;
      is_active: boolean | null;
    }>(
      `SELECT l.id AS link_id,
              p.name AS person_name,
              u.id AS user_id,
              COALESCE(u.display_name, u.full_name) AS name,
              u.access_level, u.department_id, u.is_active
         FROM ee.design_tracker_links l
         JOIN ee.design_tracker_people p ON p.id = l.person_id
         LEFT JOIN public.users u ON u.id = p.user_id
        WHERE l.token_hash = $1
          AND l.revoked_at IS NULL
          AND p.is_active`,
      [tokenHash],
    );

    /* 404, not 403: a wrong link should not confirm that a right one exists. */
    if (!row) return new NextResponse("Not found", { status: 404 });

    if (!row.user_id || !row.is_active || !row.access_level) {
      return new NextResponse(
        `${row.person_name} does not have a portal account yet. Ask Monica to set one up.`,
        { status: 409 },
      );
    }

    const user = {
      id: row.user_id,
      name: row.name ?? row.person_name,
      accessLevel: row.access_level,
      departmentId: row.department_id,
    };
    const { token, expiresAt } = await createSession(user, "tracker-link", {
      userAgent: userAgent(request),
      ipAddress: ip === "unknown" ? null : ip,
    });

    await query(`UPDATE ee.design_tracker_links SET last_used_at = NOW() WHERE id = $1`, [
      row.link_id,
    ]);
    /* Recorded against users, not design_tracker, deliberately. Who opened a
       link and when is a security question and belongs in the audit trail —
       but the board's activity feed answers a different one, "what has been
       done to my projects", which Vishakha reads every morning. Filing sign-
       ins there buries the two lines that matter under five that do not. */
    await writeAudit({
      userId: user.id,
      action: "LOGIN",
      resourceType: "users",
      resourceId: user.id,
      newValues: { via: "tracker-link", person: row.person_name, ip },
    });

    const response = NextResponse.redirect(new URL("/design-tracker", request.nextUrl.origin));
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

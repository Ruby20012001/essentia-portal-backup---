import { NextRequest, NextResponse } from "next/server";
import { stampBoardToday } from "@/lib/services/wio-tracker";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Move the WIO board on to today, every morning.
 *
 * Vercel Cron (frontend/vercel.json — "0 3 * * *" is 03:00 UTC, 08:30 in
 * Delhi). It runs before the design reminders at 03:30 so anything that reads
 * the board afterwards reads today's board and not yesterday's.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when that variable is set
 * on the project. Without it this refuses everyone. The stamp is the one value
 * every reader of the board shares, and a URL that moves it is not a URL to
 * leave lying about — somebody could walk the board a week forward and every
 * overdue count on it would change.
 *
 * Safe to call twice: a second call in the same day changes nothing and says
 * `changed: false`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not set on this deployment, so the board cannot stamp itself. Until it is, somebody has to press Stamp today on the Setup tab.",
      },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  try {
    return NextResponse.json(await stampBoardToday());
  } catch (error) {
    return toErrorResponse(error);
  }
}

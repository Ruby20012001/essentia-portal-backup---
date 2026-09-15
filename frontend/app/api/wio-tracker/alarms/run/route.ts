import { NextRequest, NextResponse } from "next/server";
import { runAlarm2Emails } from "@/lib/services/wio-tracker-alarms";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * The daily ALARM 2 email run (db/049) — "Escalation to Hardesh sir as well."
 *
 * Called by Vercel Cron (frontend/vercel.json), which sends
 * `Authorization: Bearer <CRON_SECRET>`. There is no session on a cron call,
 * so the secret IS the permission: without CRON_SECRET set on the deployment
 * the run refuses to start at all, rather than being open to anyone with the
 * URL — an endpoint that emails the CEO must never be reachable by a guess.
 *
 * GET because that is what Vercel Cron sends; POST so it can also be run by
 * hand with the same header.
 */
async function run(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not set on this deployment — the ALARM 2 email run stays off until it is.",
      },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  try {
    return NextResponse.json(await runAlarm2Emails(`${request.nextUrl.origin}/board`));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

import { NextRequest, NextResponse } from "next/server";
import { runDesignReminders } from "@/lib/services/design-reminders";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * The 09:00 IST run of the design tracker's morning reminders, called by
 * Vercel Cron (frontend/vercel.json — "30 3 * * *" is 03:30 UTC).
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when that variable is set
 * on the project. Without it this refuses everyone: an open URL that emails
 * the whole design team is not a URL to leave lying about, even though the
 * one-a-day lock would stop it sending twice.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set on this deployment, so the morning reminders cannot run on their own." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  try {
    const link = `${request.nextUrl.origin}/design-tracker`;
    return NextResponse.json(await runDesignReminders("cron", link));
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { emailMany, listContactable } from "@/lib/services/candidate-contact";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Everybody still moving, and whether they hold a link they have opened. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ candidates: await listContactable(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Email several people their links at once.
 *
 * Email only. WhatsApp works by opening a window per person, which a browser
 * blocks after the first — offering it in bulk would be pretending to do
 * something the portal cannot do.
 *
 * Every outcome comes back named, successes and failures together. A run that
 * stopped at the first bad address would leave HR unable to say who had been
 * written to without opening twenty files.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { candidateIds?: unknown };
    const ids = Array.isArray(body.candidateIds)
      ? body.candidateIds.filter((v): v is string => typeof v === "string")
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Nobody is selected." }, { status: 400 });
    }

    const user = await getCurrentUser();
    const outcomes = await emailMany(user, ids);
    return NextResponse.json(
      { outcomes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

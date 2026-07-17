import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { generateSuccessionPacks } from "@/lib/services/succession-pack";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * DEV ONLY — run the succession-pack generation now instead of waiting for the
 * daily slot. POST {"regenerate": true} rebuilds packs that already exist, which
 * is how a template change (a row edit in portal.succession_pack_sections) is
 * picked up for an exit already on the books. Gated by AUTH_ALLOW_DEV_LOGIN.
 */
export async function POST(request: NextRequest) {
  if (process.env.AUTH_ALLOW_DEV_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const user = await getCurrentUser();
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(
      await generateSuccessionPacks(user, { regenerate: Boolean(body?.regenerate) }),
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

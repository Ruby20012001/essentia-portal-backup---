import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requestWioApproval } from "@/lib/services/wio";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

/** Send a WIO's drawings into the GFC approval chain (workflow engine). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const bad = invalidId(params.id);
  if (bad) return bad;
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await requestWioApproval(user, params.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}

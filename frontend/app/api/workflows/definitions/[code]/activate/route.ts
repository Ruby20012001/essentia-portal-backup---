import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { activateDefinition } from "@/lib/services/workflow-builder";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Activate a draft definition (validates first; blocks if not ready). */
export async function POST(_request: Request, { params }: { params: { code: string } }) {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await activateDefinition(user, params.code));
  } catch (error) {
    return toErrorResponse(error);
  }
}

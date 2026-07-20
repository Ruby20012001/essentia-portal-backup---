import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { archiveDefinition, restoreDefinition } from "@/lib/services/workflow-definitions";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Archive a workflow definition — stops NEW instances; running work continues.
 * DELETE restores it. Nothing is ever hard-deleted.
 */
export async function POST(_request: Request, { params }: { params: { code: string } }) {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await archiveDefinition(user, params.code));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: { code: string } }) {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await restoreDefinition(user, params.code));
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkflowDefinitionDetail, updateDefinitionMeta } from "@/lib/services/workflow-builder";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Full structure of one definition, for the builder (read-only). */
export async function GET(_request: Request, { params }: { params: { code: string } }) {
  try {
    const user = await getCurrentUser();
    const detail = await getWorkflowDefinitionDetail(user, params.code);
    if (!detail) {
      return NextResponse.json({ error: "Workflow definition not found." }, { status: 404 });
    }
    return NextResponse.json({ detail });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const metaSchema = z.object({
  name: z.string().min(1).optional(),
  resourceType: z.string().min(1).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});

/** Rename / change module / description of an editable (draft) definition. */
export async function PATCH(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const user = await getCurrentUser();
    const parsed = metaSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid metadata" }, { status: 400 });
    }
    return NextResponse.json(await updateDefinitionMeta(user, params.code, parsed.data));
  } catch (error) {
    return toErrorResponse(error);
  }
}

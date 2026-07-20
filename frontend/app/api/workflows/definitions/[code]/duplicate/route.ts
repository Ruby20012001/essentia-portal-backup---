import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { duplicateDefinition } from "@/lib/services/workflow-definitions";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().min(3).max(50),
  name: z.string().min(1).max(200),
});

/**
 * Deep-copy a definition (groups + approvers) under a new code. The copy is
 * created INACTIVE — the safe way to revise a live workflow is to duplicate,
 * edit the copy, then archive the original.
 */
export async function POST(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const user = await getCurrentUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "code and name are required" }, { status: 400 });
    }
    return NextResponse.json(
      await duplicateDefinition(user, params.code, parsed.data.code, parsed.data.name),
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

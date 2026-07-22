import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createDefinition } from "@/lib/services/workflow-builder";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  resourceType: z.string().min(1).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});

/** Create a new (draft, inactive) workflow definition. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "code and name are required" }, { status: 400 });
    }
    return NextResponse.json(await createDefinition(user, parsed.data), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

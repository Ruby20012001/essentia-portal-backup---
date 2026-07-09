import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createDelegation, listDelegations } from "@/lib/services/workflow-delegations";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  delegatorId: z.string().uuid().optional(),
  delegateId: z.string().uuid(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  definitionCode: z.string().min(1).nullable().optional(),
  reason: z.string().max(500).optional(),
});

/** My delegations (as delegator or delegate). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ delegations: await listDelegations(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Create a standing (out-of-office) delegation. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }
    return NextResponse.json(await createDelegation(user, parsed.data), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

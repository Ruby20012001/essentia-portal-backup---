import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { delegateTask } from "@/lib/services/workflow-delegations";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const schema = z.object({
  toUserId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

/** Ad-hoc: delegate the acting user's pending task on this workflow instance. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const bad = invalidId(params.id);
  if (bad) return bad;
  try {
    const user = await getCurrentUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "toUserId (uuid) required" }, { status: 400 });
    }
    return NextResponse.json(await delegateTask(user, params.id, parsed.data.toUserId, parsed.data.reason));
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { markProjectActivitiesDone } from "@/lib/services/design-tracker";
import { toErrorResponse } from "@/lib/api/errors";
import { invalidId } from "@/lib/api/params";

export const dynamic = "force-dynamic";

const bulkSchema = z.object({
  activityIds: z.array(z.string().uuid()).min(1).max(100),
  // A date marks them done on it; null puts them back to open (Undo).
  doneOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date (YYYY-MM-DD)")
    .nullable(),
});

/** Several activities on one project done — or undone — in one go. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const badId = invalidId(params.id);
  if (badId) return badId;
  try {
    const user = await getCurrentUser();
    const parsed = bulkSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const changed = await markProjectActivitiesDone(user, params.id, parsed.data.activityIds, parsed.data.doneOn);
    return NextResponse.json({ ok: true, changed });
  } catch (error) {
    return toErrorResponse(error);
  }
}

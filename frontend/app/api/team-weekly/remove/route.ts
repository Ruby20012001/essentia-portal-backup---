import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { boardVisitor, deleteWeeklyEntries } from "@/lib/services/team-weekly";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** End of the week: clear the rows on screen in one go, all or nothing. */
const removeSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) });

export async function POST(request: NextRequest) {
  try {
    const user = await boardVisitor();
    const parsed = removeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const removed = await deleteWeeklyEntries(user, parsed.data.ids);
    return NextResponse.json({ removed });
  } catch (error) {
    return toErrorResponse(error);
  }
}

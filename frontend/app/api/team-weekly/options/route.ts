import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { addWeeklyOption } from "@/lib/services/team-weekly";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** A new particular (beside RK / MR / JKR) or work type (beside Layouts / Intents / SLD). */
const optionSchema = z.object({
  kind: z.enum(["particular", "work_type"]),
  name: z.string().trim().min(1).max(80),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = optionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    await addWeeklyOption(user, parsed.data.kind, parsed.data.name);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

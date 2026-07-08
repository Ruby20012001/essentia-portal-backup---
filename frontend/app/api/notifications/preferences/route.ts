import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getPreferences, upsertPreferences } from "@/lib/notifications/engine/preferences";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ preferences: await getPreferences(user.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const prefSchema = z.object({
  channels: z.record(z.boolean()).optional(),
  categoryPrefs: z.record(z.boolean()).optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  digestFrequency: z.enum(["none", "daily", "weekly"]).optional(),
});

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = prefSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid preferences", details: parsed.error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ preferences: await upsertPreferences(user.id, parsed.data) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

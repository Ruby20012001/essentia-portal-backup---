import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import {
  previewDesignReminders,
  runDesignRemindersAsManager,
  updateReminderSettings,
} from "@/lib/services/design-reminders";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** What the morning reminders would send now, who they go to, and what went. Managers only. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await previewDesignReminders(user));
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** "Send today's now" — the same run as 09:00, locked to once a day per person. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(
      await runDesignRemindersAsManager(user, `${request.nextUrl.origin}/design-tracker`),
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

const patchSchema = z
  .object({
    remindersOn: z.boolean().optional(),
    skipSunday: z.boolean().optional(),
    escalateAfter: z.number().int().min(1).max(60).optional(),
    escalateAgainAfter: z.number().int().min(1).max(120).optional(),
    escalateAgainTo: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field" });

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }
    await updateReminderSettings(user, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

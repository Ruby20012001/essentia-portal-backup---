import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createDesignProject } from "@/lib/services/design-tracker";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date (YYYY-MM-DD)")
  .nullable();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  client: z.string().max(200).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  designerId: z.string().uuid(),
  typeCode: z.string().min(1).max(30).nullable().optional(),
  // Optional: a project with no start date is on the board as NOT TRACKED.
  startDate: dateField.optional(),
  notes: z.string().max(2000).nullable().optional(),
  doneThroughPosition: z.number().int().min(1).max(1000).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const id = await createDesignProject(user, parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

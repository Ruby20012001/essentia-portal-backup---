import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, getSession } from "@/lib/auth/session";
import { createStageRow, getPublicStageBoard, getStageBoard } from "@/lib/services/stage-tracker";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** The Stage Tracker in one read — every row on all three tabs. Signed out, read only. */
export async function GET() {
  try {
    const session = await getSession().catch(() => null);
    return NextResponse.json(session ? await getStageBoard(session.user) : await getPublicStageBoard());
  } catch (error) {
    return toErrorResponse(error);
  }
}

const createSchema = z.object({
  discipline: z.enum(["id", "3d", "arch"]),
  project: z.string().trim().min(1, "Name the project").max(200),
  member: z.string().max(120).nullable().optional(),
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
    const id = await createStageRow(user, parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

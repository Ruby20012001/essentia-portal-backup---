import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { boardVisitor, createWeeklyEntry, getTeamWeeklyBoard } from "@/lib/services/team-weekly";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** The whole Team Weekly Board in one read — options and every entry. */
export async function GET() {
  try {
    const user = await boardVisitor();
    return NextResponse.json(await getTeamWeeklyBoard(user));
  } catch (error) {
    return toErrorResponse(error);
  }
}

const createSchema = z.object({
  team: z.string().min(1).max(80),
  particular: z.string().min(1).max(80),
  workType: z.string().min(1).max(80),
  title: z.string().trim().min(1, "Say what was done").max(2000),
  qty: z.number().int().min(1).max(999),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date (YYYY-MM-DD)"),
  status: z.enum(["done", "progress", "pending"]),
});

export async function POST(request: NextRequest) {
  try {
    const user = await boardVisitor();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const id = await createWeeklyEntry(user, parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

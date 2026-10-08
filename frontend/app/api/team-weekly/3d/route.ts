import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createProject3d, getTeam3dBoard } from "@/lib/services/team-weekly";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** The 3D page in one read — the teams and every project. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json(await getTeam3dBoard(user));
  } catch (error) {
    return toErrorResponse(error);
  }
}

const createSchema = z.object({
  teamId: z.string().uuid(),
  stage: z.enum(["ongoing", "revisions", "signoff"]),
  name: z.string().trim().min(1, "Name the project").max(200),
  client: z.string().max(200).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
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
    const id = await createProject3d(user, parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

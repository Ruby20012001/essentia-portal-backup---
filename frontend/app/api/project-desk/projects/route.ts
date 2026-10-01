import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { addDeskProject, listDeskProjects } from "@/lib/services/project-desk";
import { STAGES, TYPES } from "@/lib/services/project-desk-logic";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const text = (max: number) => z.string().max(max).nullable().optional();

const projectFields = {
  name: z.string().trim().min(1, "Give the project a name").max(200),
  client: text(200),
  city: text(100),
  type: z.enum(TYPES),
  stage: z.enum(STAGES),
  owner: text(120),
  next_step: text(300),
  due_date: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use a calendar date")
    .nullable()
    .optional(),
};

/** Every project, soonest due first. Polled by the page every 15 seconds. */
export async function GET() {
  try {
    await getCurrentUser();
    return NextResponse.json({ projects: await listDeskProjects() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = z.object(projectFields).safeParse(await request.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json({ error: first?.message ?? "Check the form" }, { status: 400 });
    }
    return NextResponse.json({ project: await addDeskProject(user, parsed.data) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

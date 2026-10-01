import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { removeDeskProject, updateDeskProject } from "@/lib/services/project-desk";
import { STAGES, TYPES } from "@/lib/services/project-desk-logic";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const text = (max: number) => z.string().max(max).nullable().optional();

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    client: text(200),
    city: text(100),
    type: z.enum(TYPES).optional(),
    stage: z.enum(STAGES).optional(),
    owner: text(120),
    next_step: text(300),
    due_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).nullable().optional(),
    site_work: z.array(z.string().max(30)).max(20).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change" });

function projectId(raw: string): number | null {
  return /^\d{1,12}$/.test(raw) ? Number(raw) : null;
}

/** One change at a time — a stage, or the site work ticks. Saves straight away. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const id = projectId(params.id);
  if (id === null) return NextResponse.json({ error: "Not a project" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "That change could not be saved" }, { status: 400 });
    }
    return NextResponse.json({ project: await updateDeskProject(user, id, parsed.data) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const id = projectId(params.id);
  if (id === null) return NextResponse.json({ error: "Not a project" }, { status: 400 });
  try {
    await getCurrentUser();
    await removeDeskProject(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

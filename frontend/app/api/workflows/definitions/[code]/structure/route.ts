import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { saveDefinitionStructure } from "@/lib/services/workflow-builder";
import type { BuilderGroup } from "@/lib/services/workflow-builder-shared";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const approver = z.object({
  approverType: z.enum(["user", "access_level", "role", "dynamic"]),
  approverUserId: z.string().uuid().nullable().optional(),
  approverLevel: z.enum(["L0", "L1", "L2", "L3"]).nullable().optional(),
  approverRef: z.string().max(100).nullable().optional(),
  approverHint: z.string().max(200).nullable().optional(),
  escalationType: z.enum(["user", "access_level", "role", "dynamic"]).nullable().optional(),
  escalationRef: z.string().max(100).nullable().optional(),
});

const group = z.object({
  name: z.string().max(200),
  quorum: z.number().int(),
  rejectPolicy: z.enum(["fail_fast", "continue"]),
  condition: z.unknown().optional(),
  slaHours: z.number().int().nullable().optional(),
  warnHours: z.number().int().nullable().optional(),
  timeoutHours: z.number().int().nullable().optional(),
  timeoutAction: z.enum(["auto_approve", "auto_reject", "escalate"]).nullable().optional(),
  reminderHours: z.number().int().nullable().optional(),
  approvers: z.array(approver),
});

const schema = z.object({ groups: z.array(group) });

/** Replace the whole group/approver structure of an editable definition. */
export async function PUT(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const user = await getCurrentUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid structure", details: parsed.error.flatten() }, { status: 400 });
    }
    const groups: BuilderGroup[] = parsed.data.groups.map((g) => ({
      name: g.name,
      quorum: g.quorum,
      rejectPolicy: g.rejectPolicy,
      condition: g.condition ?? null,
      slaHours: g.slaHours ?? null,
      warnHours: g.warnHours ?? null,
      timeoutHours: g.timeoutHours ?? null,
      timeoutAction: g.timeoutAction ?? null,
      reminderHours: g.reminderHours ?? null,
      approvers: g.approvers.map((a) => ({
        approverType: a.approverType,
        approverUserId: a.approverUserId ?? null,
        approverLevel: a.approverLevel ?? null,
        approverRef: a.approverRef ?? null,
        approverHint: a.approverHint ?? null,
        escalationType: a.escalationType ?? null,
        escalationRef: a.escalationRef ?? null,
      })),
    }));
    return NextResponse.json(await saveDefinitionStructure(user, params.code, groups));
  } catch (error) {
    return toErrorResponse(error);
  }
}

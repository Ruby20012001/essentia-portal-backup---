import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const schema = z.object({
  instanceId: z.string().uuid(),
  hours: z.number().int().positive().max(10000),
});

/**
 * DEV ONLY — backdate a workflow instance's pending-task deadlines by `hours`
 * so the SLA sweep's warning/breach/reminder/timeout thresholds fire without
 * waiting real time. Gated by AUTH_ALLOW_DEV_LOGIN (404 in production).
 */
export async function POST(request: NextRequest) {
  if (process.env.AUTH_ALLOW_DEV_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await getCurrentUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "instanceId (uuid) and hours (int) required" }, { status: 400 });
    }
    const rows = await query<{ id: string }>(
      `UPDATE portal.workflow_tasks
         SET assigned_at = assigned_at - ($2 * INTERVAL '1 hour'),
             sla_due_at  = sla_due_at  - ($2 * INTERVAL '1 hour'),
             warn_at     = warn_at     - ($2 * INTERVAL '1 hour'),
             timeout_at  = timeout_at  - ($2 * INTERVAL '1 hour'),
             reminded_at = CASE WHEN reminded_at IS NULL THEN NULL
                                ELSE reminded_at - ($2 * INTERVAL '1 hour') END
       WHERE instance_id = $1 AND status = 'pending'
       RETURNING id`,
      [parsed.data.instanceId, parsed.data.hours],
    );
    return NextResponse.json({ agedTasks: rows.length, hours: parsed.data.hours });
  } catch (error) {
    return toErrorResponse(error);
  }
}

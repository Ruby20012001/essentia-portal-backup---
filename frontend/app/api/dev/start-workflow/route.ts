import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { startWorkflow } from "@/lib/services/workflows";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const schema = z.object({
  workflowCode: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().uuid(),
});

/**
 * DEV ONLY — start an arbitrary workflow instance for testing (e.g. driving the
 * parallel_demo chain). Gated by AUTH_ALLOW_DEV_LOGIN so it 404s in production;
 * real workflows are started by their owning module (e.g. pio.requestPioApproval).
 */
export async function POST(request: NextRequest) {
  if (process.env.AUTH_ALLOW_DEV_LOGIN !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const user = await getCurrentUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "workflowCode, resourceType, resourceId (uuid) required" }, { status: 400 });
    }
    const instanceId = await startWorkflow(
      user,
      parsed.data.workflowCode,
      parsed.data.resourceType,
      parsed.data.resourceId,
    );
    return NextResponse.json({ instanceId });
  } catch (error) {
    return toErrorResponse(error);
  }
}

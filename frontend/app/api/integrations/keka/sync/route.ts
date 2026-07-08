import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { runKekaSync } from "@/lib/integrations/keka/sync";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Manual org sync. Gated at hr_access on users → L0/L1 only. */
export async function POST() {
  try {
    const user = await getCurrentUser();
    const result = await runKekaSync(user, "manual");
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

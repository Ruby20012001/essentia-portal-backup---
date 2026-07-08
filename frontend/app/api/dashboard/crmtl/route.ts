import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCrmtlDashboard } from "@/lib/services/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const data = await getCrmtlDashboard(user);
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

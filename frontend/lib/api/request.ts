import type { NextRequest } from "next/server";

/** Best-effort client IP from proxy headers, falling back to null. */
export function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

export function userAgent(request: NextRequest): string | null {
  return request.headers.get("user-agent");
}

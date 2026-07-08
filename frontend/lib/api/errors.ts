import { NextResponse } from "next/server";
import { PermissionError } from "@/lib/services/permissions";
import { WorkflowError } from "@/lib/services/workflows";
import {
  BlockingRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/services/blocking";
import { AccountLockedError, AuthError } from "@/lib/auth/errors";
import { AuthProviderError } from "@/lib/auth/providers/types";

/** Uniform API error mapping — service errors carry their own status. */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof PermissionError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (
    error instanceof WorkflowError ||
    error instanceof BlockingRuleError ||
    error instanceof ConflictError ||
    error instanceof NotFoundError ||
    error instanceof AuthError ||
    error instanceof AuthProviderError ||
    error instanceof AccountLockedError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 500 });
}

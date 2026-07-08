import { describe, expect, it } from "vitest";
import { toErrorResponse } from "@/lib/api/errors";
import {
  BlockingRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/services/blocking";
import { PermissionError } from "@/lib/services/permissions";
import { WorkflowError } from "@/lib/services/workflows";

const l3User = {
  id: "00000000-0000-4000-8000-000000000004",
  name: "Dev L3",
  accessLevel: "L3" as const,
  departmentId: null,
};

describe("toErrorResponse status mapping", () => {
  it("maps blocking rules to 422 with the exact message", async () => {
    const res = toErrorResponse(new BlockingRuleError("checklist incomplete"));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("checklist incomplete");
  });

  it("maps conflicts to 409", () => {
    expect(toErrorResponse(new ConflictError("already converted")).status).toBe(409);
  });

  it("maps not-found to 404", () => {
    expect(toErrorResponse(new NotFoundError("no such WIO")).status).toBe(404);
  });

  it("maps permission refusals to 403 naming the level", async () => {
    const res = toErrorResponse(new PermissionError(l3User, "read", "billing"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("L3");
  });

  it("maps workflow errors to their own status", () => {
    expect(toErrorResponse(new WorkflowError("not yours", 403)).status).toBe(403);
    expect(toErrorResponse(new WorkflowError("unresolved", 409)).status).toBe(409);
  });

  it("maps unknown errors to 500", () => {
    expect(toErrorResponse(new Error("boom")).status).toBe(500);
  });
});

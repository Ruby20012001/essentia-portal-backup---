import { describe, expect, it } from "vitest";
import { evaluateCondition, validateCondition } from "@/lib/services/workflow-conditions";

/**
 * The restricted condition DSL (WES §7). Pure evaluator + save-time validator.
 * The DB-backed skip-on-false routing is proven in the harness + a live drive.
 */
describe("evaluateCondition", () => {
  const ctx = { amount: 60_000_000, region: "north", vip: true };

  it("null / undefined condition always runs", () => {
    expect(evaluateCondition(ctx, null)).toBe(true);
    expect(evaluateCondition(ctx, undefined)).toBe(true);
  });

  it("numeric comparisons", () => {
    expect(evaluateCondition(ctx, { field: "amount", op: ">", value: 50_000_000 })).toBe(true);
    expect(evaluateCondition(ctx, { field: "amount", op: ">", value: 70_000_000 })).toBe(false);
    expect(evaluateCondition(ctx, { field: "amount", op: "<=", value: 60_000_000 })).toBe(true);
  });

  it("equality / membership", () => {
    expect(evaluateCondition(ctx, { field: "region", op: "==", value: "north" })).toBe(true);
    expect(evaluateCondition(ctx, { field: "region", op: "!=", value: "south" })).toBe(true);
    expect(evaluateCondition(ctx, { field: "region", op: "in", value: ["north", "east"] })).toBe(true);
    expect(evaluateCondition(ctx, { field: "region", op: "not_in", value: ["north"] })).toBe(false);
  });

  it("exists on absent field is false; comparisons on absent field are false", () => {
    expect(evaluateCondition(ctx, { field: "missing", op: "exists" })).toBe(false);
    expect(evaluateCondition(ctx, { field: "vip", op: "exists" })).toBe(true);
    expect(evaluateCondition(ctx, { field: "missing", op: ">", value: 1 })).toBe(false);
  });

  it("string/number comparisons that are type-mismatched are false (no coercion)", () => {
    expect(evaluateCondition(ctx, { field: "region", op: ">", value: 5 })).toBe(false);
  });

  it("logical and / or / not", () => {
    expect(evaluateCondition(ctx, {
      op: "and",
      clauses: [
        { field: "amount", op: ">", value: 50_000_000 },
        { field: "vip", op: "==", value: true },
      ],
    })).toBe(true);
    expect(evaluateCondition(ctx, {
      op: "or",
      clauses: [
        { field: "amount", op: ">", value: 999_000_000 },
        { field: "region", op: "==", value: "north" },
      ],
    })).toBe(true);
    expect(evaluateCondition(ctx, { op: "not", clauses: [{ field: "vip", op: "==", value: false }] })).toBe(true);
  });

  it("does not execute code — a string node is inert (fails safe to run)", () => {
    expect(evaluateCondition(ctx, "amount > 0")).toBe(true);
    expect(evaluateCondition(ctx, { field: "amount", op: "eval", value: "x" })).toBe(true);
  });
});

describe("validateCondition", () => {
  it("accepts well-formed predicates", () => {
    expect(validateCondition(null).valid).toBe(true);
    expect(validateCondition({ field: "amount", op: ">", value: 5 }).valid).toBe(true);
    expect(validateCondition({ field: "x", op: "exists" }).valid).toBe(true);
    expect(validateCondition({ op: "and", clauses: [{ field: "a", op: "==", value: 1 }] }).valid).toBe(true);
  });

  it("rejects unknown operators", () => {
    const r = validateCondition({ field: "amount", op: "eval", value: "x" });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/unknown operator/);
  });

  it("rejects missing value on a comparison that needs one", () => {
    expect(validateCondition({ field: "amount", op: ">" }).valid).toBe(false);
  });

  it("rejects malformed nodes and bad 'not' arity", () => {
    expect(validateCondition({ nope: true }).valid).toBe(false);
    expect(validateCondition({ op: "not", clauses: [{ field: "a", op: "exists" }, { field: "b", op: "exists" }] }).valid).toBe(false);
  });
});

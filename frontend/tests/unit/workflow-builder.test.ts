import { describe, it, expect } from "vitest";
import {
  validateDefinitionStructure,
  hasBlockingErrors,
  type BuilderApprover,
  type BuilderGroup,
} from "@/lib/services/workflow-builder-shared";

/**
 * Pure validation for the Workflow Builder (screen 5). These rules are the
 * contract the server enforces on ACTIVATE and the client mirrors live, so they
 * are unit-tested directly — no DB.
 */

function approver(over: Partial<BuilderApprover> = {}): BuilderApprover {
  return {
    approverType: "access_level",
    approverUserId: null,
    approverLevel: "L1",
    approverRef: null,
    approverHint: null,
    escalationType: null,
    escalationRef: null,
    ...over,
  };
}

function group(over: Partial<BuilderGroup> = {}): BuilderGroup {
  return {
    name: "Review",
    quorum: 1,
    rejectPolicy: "fail_fast",
    condition: null,
    slaHours: null,
    warnHours: null,
    timeoutHours: null,
    timeoutAction: null,
    reminderHours: null,
    approvers: [approver()],
    ...over,
  };
}

const errors = (g: BuilderGroup[]) => validateDefinitionStructure(g).filter((i) => i.level === "error");
const warnings = (g: BuilderGroup[]) => validateDefinitionStructure(g).filter((i) => i.level === "warning");

describe("validateDefinitionStructure", () => {
  it("a minimal valid definition has no issues", () => {
    expect(validateDefinitionStructure([group()])).toEqual([]);
    expect(hasBlockingErrors(validateDefinitionStructure([group()]))).toBe(false);
  });

  it("requires at least one group", () => {
    const iss = validateDefinitionStructure([]);
    expect(iss).toHaveLength(1);
    expect(iss[0]).toMatchObject({ level: "error", group: null });
  });

  it("requires each group to have a name and an approver", () => {
    expect(errors([group({ name: "  " })]).some((e) => /name/i.test(e.message))).toBe(true);
    expect(errors([group({ approvers: [] })]).some((e) => /approver/i.test(e.message))).toBe(true);
  });

  it("rejects quorum greater than the number of approvers", () => {
    const iss = errors([group({ quorum: 3, approvers: [approver(), approver()] })]);
    expect(iss.some((e) => /quorum/i.test(e.message))).toBe(true);
  });

  it("accepts quorum equal to the number of approvers (2-of-2)", () => {
    expect(hasBlockingErrors(validateDefinitionStructure([group({ quorum: 2, approvers: [approver(), approver()] })]))).toBe(false);
  });

  it("rejects quorum below 1", () => {
    expect(errors([group({ quorum: 0 })]).some((e) => /quorum/i.test(e.message))).toBe(true);
  });

  it("requires a timeout action when timeout hours are set, and vice versa", () => {
    expect(errors([group({ timeoutHours: 48 })]).some((e) => /timeout action/i.test(e.message))).toBe(true);
    expect(errors([group({ timeoutAction: "auto_approve" })]).some((e) => /timeout hours/i.test(e.message))).toBe(true);
  });

  it("escalate-on-timeout requires an approver with an escalation target", () => {
    const noTarget = errors([group({ timeoutHours: 48, timeoutAction: "escalate" })]);
    expect(noTarget.some((e) => /escalation target/i.test(e.message))).toBe(true);

    const withTarget = validateDefinitionStructure([
      group({
        timeoutHours: 48,
        timeoutAction: "escalate",
        approvers: [approver({ escalationType: "user", escalationRef: "dev.founder@essentia.in" })],
      }),
    ]);
    expect(hasBlockingErrors(withTarget)).toBe(false);
  });

  it("validates approver targets by type", () => {
    expect(errors([group({ approvers: [approver({ approverType: "user", approverUserId: null })] })]).some((e) => /choose a user/i.test(e.message))).toBe(true);
    expect(errors([group({ approvers: [approver({ approverType: "access_level", approverLevel: null })] })]).some((e) => /access level/i.test(e.message))).toBe(true);
    expect(errors([group({ approvers: [approver({ approverType: "role", approverRef: "" })] })]).some((e) => /role reference/i.test(e.message))).toBe(true);
  });

  it("flags a warning (not an error) when warning fires after the SLA", () => {
    const g = [group({ slaHours: 12, warnHours: 24 })];
    expect(hasBlockingErrors(validateDefinitionStructure(g))).toBe(false);
    expect(warnings(g).some((w) => /warning fires after/i.test(w.message))).toBe(true);
  });

  it("accepts a valid DSL condition and rejects a malformed one", () => {
    const valid = [group({ condition: { field: "amount", op: ">", value: 50000000 } })];
    expect(hasBlockingErrors(validateDefinitionStructure(valid))).toBe(false);

    const badOp = errors([group({ condition: { field: "amount", op: "=", value: 1 } })]);
    expect(badOp.some((e) => /condition invalid/i.test(e.message))).toBe(true);

    const emptyField = errors([group({ condition: { field: "", op: ">", value: 1 } })]);
    expect(emptyField.some((e) => /field name/i.test(e.message))).toBe(true);

    const notObject = errors([group({ condition: [1, 2, 3] })]);
    expect(notObject.some((e) => /json object/i.test(e.message))).toBe(true);
  });

  it("reports issues per group with the 1-based group number", () => {
    const iss = validateDefinitionStructure([group(), group({ approvers: [] })]);
    expect(iss.some((i) => i.group === 2 && /approver/i.test(i.message))).toBe(true);
    expect(iss.some((i) => i.group === 1)).toBe(false);
  });
});

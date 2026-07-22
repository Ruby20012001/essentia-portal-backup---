/**
 * Workflow Builder — shared, PURE types + validation (frontend screen 5). No DB
 * or server imports, so the client editor and the server service validate against
 * exactly the same rules. Mirrors the schema CHECKs on portal.workflow_groups /
 * workflow_group_approvers (013) and adds the semantic rules the DB can't express
 * (quorum ≤ approvers, escalate needs a target, etc.).
 *
 * This validation is ADVISORY for saving a draft and BLOCKING for activation —
 * a half-built definition can be saved but never activated.
 */

import { validateCondition } from "@/lib/services/workflow-conditions";

export type ApproverType = "user" | "access_level" | "role" | "dynamic";
export type RejectPolicy = "fail_fast" | "continue";
export type TimeoutAction = "auto_approve" | "auto_reject" | "escalate";
export type AccessLevel = "L0" | "L1" | "L2" | "L3";

export const APPROVER_TYPES: ApproverType[] = ["user", "access_level", "role", "dynamic"];
export const REJECT_POLICIES: RejectPolicy[] = ["fail_fast", "continue"];
export const TIMEOUT_ACTIONS: TimeoutAction[] = ["auto_approve", "auto_reject", "escalate"];
export const ACCESS_LEVELS: AccessLevel[] = ["L0", "L1", "L2", "L3"];

export type BuilderApprover = {
  approverType: ApproverType;
  approverUserId: string | null;
  approverLevel: AccessLevel | null;
  approverRef: string | null;
  approverHint: string | null;
  escalationType: ApproverType | null;
  escalationRef: string | null;
  // display-only (ignored on save):
  approverName?: string | null;
};

export type BuilderGroup = {
  name: string;
  quorum: number;
  rejectPolicy: RejectPolicy;
  condition: unknown | null; // JSONB; null = always run
  slaHours: number | null;
  warnHours: number | null;
  timeoutHours: number | null;
  timeoutAction: TimeoutAction | null;
  reminderHours: number | null;
  approvers: BuilderApprover[];
};

export type ValidationIssue = { level: "error" | "warning"; group: number | null; message: string };

function positiveHoursIssues(g: BuilderGroup, gi: number): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const fields: Array<[string, number | null]> = [
    ["SLA", g.slaHours],
    ["Warning", g.warnHours],
    ["Timeout", g.timeoutHours],
    ["Reminder", g.reminderHours],
  ];
  for (const [label, v] of fields) {
    if (v != null && (!Number.isInteger(v) || v <= 0)) {
      out.push({ level: "error", group: gi, message: `${label} hours must be a positive whole number.` });
    }
  }
  return out;
}

/** Every problem with a proposed structure. Empty = ready to activate. */
export function validateDefinitionStructure(groups: BuilderGroup[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!groups || groups.length === 0) {
    issues.push({ level: "error", group: null, message: "Add at least one approval group." });
    return issues;
  }

  groups.forEach((g, i) => {
    const gi = i + 1;
    const approvers = g.approvers ?? [];

    if (!g.name || !g.name.trim()) {
      issues.push({ level: "error", group: gi, message: "Group needs a name." });
    }
    if (approvers.length === 0) {
      issues.push({ level: "error", group: gi, message: "Group needs at least one approver." });
    }
    if (!Number.isInteger(g.quorum) || g.quorum < 1) {
      issues.push({ level: "error", group: gi, message: "Quorum must be at least 1." });
    } else if (approvers.length > 0 && g.quorum > approvers.length) {
      issues.push({
        level: "error",
        group: gi,
        message: `Quorum (${g.quorum}) can't exceed the ${approvers.length} approver${approvers.length === 1 ? "" : "s"} in the group.`,
      });
    }
    if (!REJECT_POLICIES.includes(g.rejectPolicy)) {
      issues.push({ level: "error", group: gi, message: "Invalid reject policy." });
    }

    issues.push(...positiveHoursIssues(g, gi));

    if (g.warnHours != null && g.slaHours != null && g.warnHours > g.slaHours) {
      issues.push({ level: "warning", group: gi, message: "Warning fires after the SLA — usually you warn earlier." });
    }
    if (g.timeoutHours != null && !g.timeoutAction) {
      issues.push({ level: "error", group: gi, message: "Choose a timeout action for the timeout window." });
    }
    if (g.timeoutAction && g.timeoutHours == null) {
      issues.push({ level: "error", group: gi, message: "Set timeout hours for the timeout action." });
    }
    if (g.slaHours != null && g.timeoutAction == null && g.timeoutHours == null) {
      issues.push({ level: "warning", group: gi, message: "SLA set but no timeout — it will warn/breach but never resolve automatically." });
    }
    if (g.timeoutAction === "escalate") {
      const hasTarget = approvers.some((a) => a.escalationType && a.escalationRef);
      if (!hasTarget) {
        issues.push({ level: "error", group: gi, message: "Escalate-on-timeout needs at least one approver with an escalation target." });
      }
    }
    if (g.condition != null) {
      if (typeof g.condition !== "object" || Array.isArray(g.condition)) {
        issues.push({ level: "error", group: gi, message: "Condition must be a JSON object, or empty for always-run." });
      } else {
        const r = validateCondition(g.condition);
        if (!r.valid) {
          issues.push({ level: "error", group: gi, message: `Condition invalid: ${r.error}.` });
        } else {
          const c = g.condition as Record<string, unknown>;
          if (typeof c.field === "string" && c.field.trim() === "") {
            issues.push({ level: "error", group: gi, message: "Condition needs a field name." });
          }
        }
      }
    }

    approvers.forEach((a, ai) => {
      const who = `Approver ${ai + 1}`;
      if (!APPROVER_TYPES.includes(a.approverType)) {
        issues.push({ level: "error", group: gi, message: `${who}: invalid approver type.` });
      }
      if (a.approverType === "user" && !a.approverUserId) {
        issues.push({ level: "error", group: gi, message: `${who}: choose a user.` });
      }
      if (a.approverType === "access_level" && !a.approverLevel) {
        issues.push({ level: "error", group: gi, message: `${who}: choose an access level.` });
      }
      if ((a.approverType === "role" || a.approverType === "dynamic") && !(a.approverRef && a.approverRef.trim())) {
        issues.push({ level: "error", group: gi, message: `${who}: enter a ${a.approverType} reference.` });
      }
      if (a.escalationType && !(a.escalationRef && String(a.escalationRef).trim())) {
        issues.push({ level: "error", group: gi, message: `${who}: escalation target is required when an escalation type is set.` });
      }
    });
  });

  return issues;
}

export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}

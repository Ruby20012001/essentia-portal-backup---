/**
 * Restricted condition DSL for conditional workflow routing (WES §7).
 *
 * A group's `condition` is a JSON predicate evaluated against the instance
 * `context`. The evaluator is PURE, TOTAL (never throws), and SIDE-EFFECT-FREE:
 * no `eval`, no `Function`, no code execution, no I/O, no SQL. Grammar:
 *
 *   Predicate := { op: "and"|"or"|"not", clauses: Predicate[] }
 *              | { field: <key>, op: Comparison, value?: Literal }
 *   Comparison := "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not_in" | "exists"
 *
 * Forbidden: arbitrary code, template/string interpolation, regex, arithmetic
 * expressions, or references outside `context`. Unknown operators are rejected
 * at save time by validateCondition (structural). At runtime evaluateCondition
 * fails SAFE for an approval gate — a malformed/unknown node returns `true`
 * (run the group / require the approval) rather than silently skipping it.
 */

const COMPARISON_OPS = new Set(["==", "!=", "<", "<=", ">", ">=", "in", "not_in", "exists"]);
const LOGICAL_OPS = new Set(["and", "or", "not"]);
const MAX_DEPTH = 8;
const MAX_CLAUSES = 32;

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Evaluate a condition node against `context`. `null` always runs (true). */
export function evaluateCondition(
  context: Record<string, unknown>,
  node: unknown,
  depth = 0,
): boolean {
  if (node === null || node === undefined) return true; // no condition → always run
  if (depth > MAX_DEPTH) return true; // bounded; fail safe (run the group)
  const n = asRecord(node);
  if (!n) return true;

  if (typeof n.op === "string" && LOGICAL_OPS.has(n.op)) {
    const clauses = Array.isArray(n.clauses) ? n.clauses : [];
    if (n.op === "and") return clauses.every((c) => evaluateCondition(context, c, depth + 1));
    if (n.op === "or") {
      return clauses.length === 0 ? true : clauses.some((c) => evaluateCondition(context, c, depth + 1));
    }
    return !evaluateCondition(context, clauses[0] ?? null, depth + 1); // not
  }

  if (typeof n.field === "string" && typeof n.op === "string" && COMPARISON_OPS.has(n.op)) {
    return compare(context[n.field], n.op, n.value);
  }
  return true; // malformed → fail safe (run the group)
}

function compare(actual: unknown, op: string, value: unknown): boolean {
  switch (op) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "==":
      return actual === value;
    case "!=":
      return actual !== value;
    case "in":
      return Array.isArray(value) && value.includes(actual as never);
    case "not_in":
      return Array.isArray(value) && !value.includes(actual as never);
    case "<":
    case "<=":
    case ">":
    case ">=": {
      if (typeof actual !== "number" || typeof value !== "number") return false;
      if (op === "<") return actual < value;
      if (op === "<=") return actual <= value;
      if (op === ">") return actual > value;
      return actual >= value;
    }
    default:
      return true;
  }
}

/**
 * Structural validation for save-time (WES §7): reject unknown operators,
 * malformed nodes, or bound violations BEFORE a definition is stored. Applies
 * when a definitions-management API lands; conditions seeded via migrations are
 * authored to this grammar.
 */
export function validateCondition(node: unknown, depth = 0): { valid: boolean; error?: string } {
  if (node === null || node === undefined) return { valid: true };
  if (depth > MAX_DEPTH) return { valid: false, error: "condition nesting too deep (max 8)" };
  const n = asRecord(node);
  if (!n) return { valid: false, error: "condition node must be an object" };

  if (typeof n.op === "string" && LOGICAL_OPS.has(n.op)) {
    if (!Array.isArray(n.clauses)) return { valid: false, error: `'${n.op}' requires a clauses array` };
    if (n.clauses.length > MAX_CLAUSES) return { valid: false, error: `too many clauses (max ${MAX_CLAUSES})` };
    if (n.op === "not" && n.clauses.length !== 1) return { valid: false, error: "'not' takes exactly one clause" };
    for (const c of n.clauses) {
      const r = validateCondition(c, depth + 1);
      if (!r.valid) return r;
    }
    return { valid: true };
  }
  if (typeof n.field === "string" && typeof n.op === "string") {
    if (!COMPARISON_OPS.has(n.op)) return { valid: false, error: `unknown operator '${n.op}'` };
    if (n.op !== "exists" && n.value === undefined) return { valid: false, error: `operator '${n.op}' requires a value` };
    return { valid: true };
  }
  return { valid: false, error: "node must be a logical (op+clauses) or comparison (field+op) predicate" };
}

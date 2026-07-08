/**
 * A blocking rule refusing an action — the portal's house pattern: the
 * system never blocks silently; it says exactly what is missing and why
 * (CLAUDE.md anti-busy rules, Ruby's session format). Maps to HTTP 422.
 */
export class BlockingRuleError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "BlockingRuleError";
  }
}

/** Not-found / conflict shapes shared by module services. */
export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

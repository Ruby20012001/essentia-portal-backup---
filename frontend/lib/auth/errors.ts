/** Authentication failure — no valid session, or credentials rejected. */
export class AuthError extends Error {
  readonly status = 401;
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthError";
  }
}

/** Account temporarily locked after too many failed attempts. */
export class AccountLockedError extends Error {
  readonly status = 423;
  constructor(message: string) {
    super(message);
    this.name = "AccountLockedError";
  }
}

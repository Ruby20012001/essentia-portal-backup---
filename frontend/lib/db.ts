import { Pool, type QueryResultRow } from "pg";

/**
 * PostgreSQL access layer. Server-side only — never import from a client
 * component. RLS fencing (L0-L3) is enforced by Postgres itself via the
 * app.user_id / app.user_access_level GUCs, so anything touching fenced
 * tables must go through withUserContext, never around it.
 */

// Next.js dev hot-reload re-evaluates modules; the pool is parked on
// globalThis so reloads don't leak connections.
const globalForDb = globalThis as unknown as { essentiaPool?: Pool };

function getPool(): Pool {
  if (!globalForDb.essentiaPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set — see frontend/.env.example");
    }
    // PGPOOL_MAX=1 when using db/dev-db.mjs (single-connection PGlite);
    // production RDS uses the default.
    globalForDb.essentiaPool = new Pool({
      connectionString,
      max: Number(process.env.PGPOOL_MAX ?? "10"),
    });
  }
  return globalForDb.essentiaPool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/**
 * Runs `fn` inside a plain transaction (BEGIN/COMMIT/ROLLBACK) on one pooled
 * connection — for atomic multi-statement writes over non-RLS tables. Unlike
 * withUserContext it does NOT switch role or set GUCs, and it avoids
 * SELECT ... FOR UPDATE (concurrency is handled with single-statement
 * conditional updates, which also keeps the PGlite dev server happy).
 */
export async function withTransaction<T>(
  fn: (q: typeof query) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const scopedQuery = async <R extends QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<R[]> => {
      const result = await client.query<R>(text, params);
      return result.rows;
    };
    const value = await fn(scopedQuery as typeof query);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type UserContext = {
  id: string;
  accessLevel: "L0" | "L1" | "L2" | "L3";
};

/**
 * Runs `fn` inside a transaction with the RLS fencing GUCs applied.
 * set_config(..., TRUE) is transaction-scoped, so user context cannot leak
 * across requests sharing a pooled connection.
 *
 * SET LOCAL ROLE essentia_app is what makes the fencing REAL: PostgreSQL
 * skips RLS for superusers and table owners, so enforcement must never
 * depend on the connection user. The role resets automatically at
 * COMMIT/ROLLBACK. (db/007_app_role.sql creates the role and grants.)
 */
export async function withUserContext<T>(
  user: UserContext,
  fn: (q: typeof query) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE essentia_app");
    await client.query(
      "SELECT set_config('app.user_id', $1, TRUE), set_config('app.user_access_level', $2, TRUE)",
      [user.id, user.accessLevel],
    );
    const scopedQuery = async <R extends QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<R[]> => {
      const result = await client.query<R>(text, params);
      return result.rows;
    };
    const value = await fn(scopedQuery as typeof query);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The same thing for somebody who does not work here.
 *
 * A candidate holding an interview link has no account, so `withUserContext`
 * has nothing to give it. This sets `app.candidate_id` instead, which db/056's
 * policies open for — their own row, their own rounds, and nothing else.
 *
 * WHY IT IS A SEPARATE FUNCTION AND NOT AN ARGUMENT. The two contexts must
 * never be held at once. A transaction that set both would be one where the
 * candidate's fence and the staff fence are OR'd together, because RLS
 * policies are OR'd and the widest one wins. Two functions means there is no
 * call site where somebody can pass both by accident.
 *
 * `app.user_id` and `app.user_access_level` are cleared rather than left
 * alone: the connection is pooled, and an empty string is already what
 * `hr.acting_user()` and `hr.may_see_hiring()` read as nobody.
 *
 * The caller resolves the token to a candidate id BEFORE calling this. That
 * lookup is the one query that cannot be fenced by the thing it is looking
 * up, so it runs as the owner in `lib/services/candidate-portal.ts` and reads
 * one column off one table.
 */
export async function withCandidateContext<T>(
  candidateId: string,
  fn: (q: typeof query) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE essentia_app");
    await client.query(
      `SELECT set_config('app.user_id', '', TRUE),
              set_config('app.user_access_level', '', TRUE),
              set_config('app.candidate_id', $1, TRUE)`,
      [candidateId],
    );
    const scopedQuery = async <R extends QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<R[]> => {
      const result = await client.query<R>(text, params);
      return result.rows;
    };
    const value = await fn(scopedQuery as typeof query);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

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

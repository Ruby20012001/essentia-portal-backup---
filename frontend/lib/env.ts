/**
 * Environment preconditions for a server-rendered portal page.
 *
 * One place, because getting this wrong is invisible in development and fatal
 * in production. Screens used to inline the check and list DEV_USER_ID as a
 * hard requirement alongside DATABASE_URL — which is right locally and wrong
 * on a real deployment: DEV_USER_ID is only ever read by the dev bootstrap in
 * lib/auth/session.ts, and only when AUTH_ALLOW_DEV_LOGIN is "true". In
 * production the acting user comes from a real session and the portal layout
 * has already redirected anyone without one to /login.
 *
 * The effect of the old check was that a correctly configured production
 * deploy — real Postgres, real Entra sessions, dev bootstrap off — rendered
 * "Database not connected" to properly signed-in users, on the dashboard they
 * land on. A page that refuses to show data it can perfectly well read is the
 * same class of dishonesty as one that invents data it cannot (ADR-HS-01);
 * both leave the reader with a false picture.
 */

/**
 * Returns the env vars this page genuinely cannot run without, for
 * <SetupNeeded/>. Empty array means go ahead.
 *
 * DATABASE_URL is always required — every portal screen renders live data.
 * DEV_USER_ID is required only while the dev bootstrap is switched on, since
 * that is the only code path that reads it.
 */
export function missingPageEnv(): string[] {
  const devBootstrap = process.env.AUTH_ALLOW_DEV_LOGIN === "true";
  return [
    !process.env.DATABASE_URL && "DATABASE_URL",
    devBootstrap && !process.env.DEV_USER_ID && "DEV_USER_ID",
  ].filter((v): v is string => typeof v === "string");
}

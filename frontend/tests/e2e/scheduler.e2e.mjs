/*
 * Scheduler / auto-pilot E2E — HTTP-only (the dev PGlite server is
 * single-connection). Requires a PRODUCTION-MODE stack on E2E_BASE
 * (AUTH_ALLOW_DEV_LOGIN unset) with migrations 001-011 + 900 fixtures.
 * The DB-level single-fire/retry invariants are proven deterministically in
 * the in-process harness (npm run validate); this exercises the HTTP path,
 * the tick running jobs as the system account, and the L2 permission gate.
 */
const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const EMAIL = "dev.crmtl@essentia.in";       // L2 (CRM_EE) fixture
const PASSWORD = "essentia-dev-2026";

let pass = 0, fail = 0;
const step = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };

const getCookie = (res) => (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith("essentia_session="))?.split(";")[0].split("=")[1] ?? null;
const call = (path, { cookie, ...init } = {}) =>
  fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: `essentia_session=${cookie}` } : {}), ...(init.headers ?? {}) } });

// 0. Log in (L2 CRM TL).
const login = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
const cookie = getCookie(login);
step("login → session cookie", login.status === 200 && Boolean(cookie));

// 1. Status endpoint: L2 has read on 'scheduler' → the three registered jobs.
let r = await call("/api/scheduler/jobs", { cookie });
let body = await r.json().catch(() => ({}));
const names = (body.jobs ?? []).map((j) => j.name).sort();
step("GET /api/scheduler/jobs → 200 + 3 jobs", r.status === 200 && names.length === 3,
  names.join(","));

// 2. Tick runs the due jobs (as the L1 system account, regardless of caller).
r = await call("/api/jobs/tick", { method: "POST", cookie });
body = await r.json().catch(() => ({}));
const outcomes = (body.jobs ?? []).map((j) => j.outcome);
step("POST /api/jobs/tick → 200 + enabled + no failures",
  r.status === 200 && body.enabled === true &&
  !outcomes.includes("failed") && !outcomes.includes("dead"),
  outcomes.join(","));

// 3. Deny-by-default: L2 may NOT manually trigger a job (escalate on scheduler).
r = await call("/api/scheduler/jobs/wio-clock/run", { method: "POST", cookie });
step("POST manual run as L2 → 403 (deny-by-default)", r.status === 403);

// 4. Unauthenticated tick is refused (dev fallback requires a session).
r = await call("/api/jobs/tick", { method: "POST" });
step("unauthenticated tick → 401", r.status === 401);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

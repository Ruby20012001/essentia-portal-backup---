/*
 * Phase 1 auth E2E — HTTP-only (no direct DB client; the dev PGlite server
 * is single-connection). Requires a PRODUCTION-MODE stack on E2E_BASE
 * (AUTH_ALLOW_DEV_LOGIN unset). Timeout-predicate logic is covered
 * deterministically in the in-process db harness (npm run validate).
 * Manual cookie handling — Node fetch does not persist cookies.
 */
const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const EMAIL = "dev.crmtl@essentia.in";
const PASSWORD = "essentia-dev-2026";

let pass = 0, fail = 0;
const step = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };
const quote = (s) => console.log("      ↳", s);

const getCookie = (res) => (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith("essentia_session="))?.split(";")[0].split("=")[1] ?? null;
const call = (path, { cookie, ...init } = {}) =>
  fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: `essentia_session=${cookie}` } : {}), ...(init.headers ?? {}) } });
const login = async (email, password) => {
  const res = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  return { status: res.status, cookie: getCookie(res), body: await res.json().catch(() => ({})) };
};

// 1. Unauthenticated protected call → 401 (middleware gate)
let r = await call("/api/wio");
step("unauthenticated /api/wio → 401", r.status === 401);

// 2. Unauthenticated page → redirect to /login
r = await call("/dashboard", { redirect: "manual" });
step("unauthenticated page → redirect to /login", r.status === 307 && (r.headers.get("location") ?? "").includes("/login"));

// 3. Wrong password → 401, generic message
let l = await login(EMAIL, "wrong-password");
step("wrong password → 401 generic", l.status === 401 && /Invalid email or password/.test(l.body.error), l.body.error);

// 4. Correct password → 200 + session cookie + level from DB
l = await login(EMAIL, PASSWORD);
step("correct password → 200 + cookie (L2 from DB)", l.status === 200 && Boolean(l.cookie) && l.body.user?.accessLevel === "L2");
const cookie = l.cookie;

// 5. Cookie unlocks the protected API
r = await call("/api/wio", { cookie });
step("session cookie unlocks /api/wio → 200", r.status === 200);

// 6. /api/auth/session reflects the user
r = await call("/api/auth/session", { cookie });
const sBody = await r.json();
step("session endpoint returns the user", r.status === 200 && sBody.user?.id && sBody.user?.accessLevel === "L2");

// 7. Sessions list: one current session with a device label
r = await call("/api/auth/sessions", { cookie });
let sess = (await r.json()).sessions ?? [];
step("sessions list shows current device", sess.length === 1 && sess[0].current === true && Boolean(sess[0].deviceLabel), sess[0]?.deviceLabel);

// 8. Concurrent cap (max 3): a 4th login revokes the oldest
const c2 = (await login(EMAIL, PASSWORD)).cookie;
const c3 = (await login(EMAIL, PASSWORD)).cookie;
const c4 = (await login(EMAIL, PASSWORD)).cookie;
r = await call("/api/auth/sessions", { cookie: c4 });
sess = (await r.json()).sessions ?? [];
step("concurrent cap holds active sessions at 3", sess.length === 3, `active=${sess.length}`);
r = await call("/api/wio", { cookie });      // the original (oldest) cookie
step("oldest cookie revoked by concurrency → 401", r.status === 401);

// 9. Sign out one device (self-revoke by id) then confirm it's gone
r = await call("/api/auth/sessions", { cookie: c4 });
const victim = ((await r.json()).sessions ?? []).find((s) => !s.current);
r = await call(`/api/auth/sessions/${victim.id}`, { method: "DELETE", cookie: c4 });
step("revoke a device by id → 200", r.status === 200);
r = await call("/api/auth/sessions", { cookie: c4 });
step("revoked device no longer listed", ((await r.json()).sessions ?? []).length === 2);

// 10. Logout revokes the current session
r = await call("/api/auth/logout", { method: "POST", cookie: c4 });
step("logout → 200 + clears cookie", r.status === 200 && (r.headers.getSetCookie?.() ?? []).some((x) => x.startsWith("essentia_session=;") || x.includes("Max-Age=0")));
r = await call("/api/wio", { cookie: c4 });
step("logged-out cookie → 401", r.status === 401);

// 11. dev-login endpoint is 404 in production mode
r = await call("/api/auth/dev-login", { method: "POST", body: JSON.stringify({ userId: "00000000-0000-4000-8000-000000000001" }) });
step("dev-login disabled in production → 404", r.status === 404);

// 12. Login throttle: hammer wrong passwords for one identity → 429
let got429 = false, hits = 0;
for (let i = 0; i < 14; i++) { const x = await login("throttle@essentia.in", "x"); hits++; if (x.status === 429) { got429 = true; break; } }
step("login throttle returns 429", got429, `after ${hits} attempts`);

// 13. Tampered cookie → 401 (unknown token)
r = await call("/api/wio", { cookie: "deadbeef".repeat(8) });
step("forged session token → 401", r.status === 401);

console.log(`\n==== AUTH E2E: ${pass} passed, ${fail} failed ====`);
process.exit(fail === 0 ? 0 : 1);

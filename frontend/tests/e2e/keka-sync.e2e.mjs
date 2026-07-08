/*
 * Phase 2 Keka sync E2E — HTTP-only (single-connection dev DB). Requires a
 * DEV-MODE stack (AUTH_ALLOW_DEV_LOGIN=true) so it can act as different
 * identities via /api/auth/dev-login. Showcase: after a sync, the PIO
 * approval chain (blocked since S4) works — Khushpreet approves step 1.
 */
const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
let pass = 0, fail = 0;
const step = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };
const quote = (s) => console.log("      ↳", s);

const getCookie = (res) => (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith("essentia_session="))?.split(";")[0].split("=")[1] ?? null;
const call = (path, { cookie, ...init } = {}) =>
  fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: `essentia_session=${cookie}` } : {}), ...(init.headers ?? {}) } });
const as = async (email) => getCookie(await call("/api/auth/dev-login", { method: "POST", body: JSON.stringify({ email }) }));
const json = async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) });

// Identities
const L2 = await as("dev.crmtl@essentia.in");   // owns the fixture projects
const L1 = await as("dev.coo@essentia.in");      // can sync (hr_access)

// 1. L2 cannot sync (hr_access denied)
let r = await json(await call("/api/integrations/keka/sync", { method: "POST", cookie: L2 }));
step("L2 denied Keka sync (403)", r.status === 403 && /L2/.test(r.body.error));

// 2. L1 runs the sync
r = await json(await call("/api/integrations/keka/sync", { method: "POST", cookie: L1 }));
const s = r.body.stats ?? {};
step("L1 sync succeeds (partial: unmapped dept present)", r.status === 200 && r.body.status === "partial", `status=${r.body.status}`);
step("sync created the org (employees)", s.employeesCreated >= 18, `created=${s.employeesCreated}`);
step("departments matched to the Master", s.departmentsMatched >= 12, `matched=${s.departmentsMatched}`);
step("unmapped 'Pottery' flagged, not created", (s.unmappedDepartments ?? []).includes("Pottery"), JSON.stringify(s.unmappedDepartments));
step("reporting hierarchy resolved", s.reportsResolved >= 15, `reports=${s.reportsResolved}`);
step("PIO approvers resolved (3)", s.approversResolved === 3, `approvers=${s.approversResolved}`);

// 3. Status endpoint reflects the run
r = await json(await call("/api/integrations/keka/status", { cookie: L1 }));
step("status shows the latest run", r.status === 200 && (r.body.runs ?? [])[0]?.provider === "fixture");

// 4. Synced users can now sign in by identity (Khushpreet exists + active)
const KHUSH = await as("khushpreet.arora@essentia.in");
const DEEPAK = await as("deepak.jain@essentia.in");
step("synced approver can authenticate", Boolean(KHUSH) && Boolean(DEEPAK));

// 5. Drive a PIO to pending approval (as the project-owning TL)
const wios = (await json(await call("/api/wio", { cookie: L2 }))).body.wios ?? [];
const ffe = wios.find((w) => w.wioNumber.endsWith("/FFE"));   // checklist already complete in fixtures
r = await json(await call(`/api/wio/${ffe.id}/convert`, { method: "POST", cookie: L2 }));
const pioId = r.body.pioId;
await call(`/api/pio/${pioId}`, { method: "PATCH", cookie: L2, body: JSON.stringify({ finalBoqSigned: true, final3dSigned: true, gfcSignedByClient: true, bomShared: true }) });
r = await json(await call(`/api/pio/${pioId}/request-approval`, { method: "POST", cookie: L2 }));
const appr = r.body.pio?.approval;
step("PIO enters approval at step 1 (Khushpreet)", r.status === 201 && appr?.currentStep === 1 && /Khushpreet/.test(appr?.approverHint ?? ""));
const instanceId = appr.instanceId;

// 6. THE PAYOFF: the previously-blocked chain now works — Khushpreet approves.
r = await json(await call(`/api/workflows/${instanceId}/act`, { method: "POST", cookie: KHUSH, body: JSON.stringify({ action: "approve" }) }));
step("Khushpreet approves step 1 → advances to step 2 (Deepak Ji)", r.status === 200 && r.body.instance?.status === "pending" && r.body.instance?.currentStep === 2 && /Deepak/.test(r.body.instance?.currentApproverHint ?? ""));
quote(`now at step ${r.body.instance?.currentStep}: ${r.body.instance?.currentApproverHint}`);

// 7. Step ownership: Khushpreet cannot approve step 2 (it's Deepak Ji's)
r = await json(await call(`/api/workflows/${instanceId}/act`, { method: "POST", cookie: KHUSH, body: JSON.stringify({ action: "approve" }) }));
step("wrong approver for step 2 refused (403)", r.status === 403 && /not yours/.test(r.body.error));

// 8. Deepak Ji approves step 2 → advances to step 3 (Hardesh)
r = await json(await call(`/api/workflows/${instanceId}/act`, { method: "POST", cookie: DEEPAK, body: JSON.stringify({ action: "approve" }) }));
step("Deepak Ji approves step 2 → step 3 (Hardesh)", r.status === 200 && r.body.instance?.currentStep === 3 && /Hardesh/.test(r.body.instance?.currentApproverHint ?? ""));

// 9. Idempotent re-sync: no new users, everyone updated
r = await json(await call("/api/integrations/keka/sync", { method: "POST", cookie: L1 }));
step("re-sync is idempotent (0 created, all updated)", r.body.stats?.employeesCreated === 0 && r.body.stats?.employeesUpdated >= 18, `created=${r.body.stats?.employeesCreated} updated=${r.body.stats?.employeesUpdated}`);

console.log(`\n==== KEKA SYNC E2E: ${pass} passed, ${fail} failed ====`);
process.exit(fail === 0 ? 0 : 1);

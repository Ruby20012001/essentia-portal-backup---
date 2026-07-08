/* S4 verification E2E — assumes a PRISTINE dev-db (restart it first). */
const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const json = async (path, init) => {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const step = (name, ok, detail) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const quote = (s) => console.log("      ↳", s);

// ---------- baseline ----------
let r = await json("/api/wio");
const wios = r.body.wios ?? [];
step("pristine clock: 4 fixture WIOs", r.status === 200 && wios.length === 4, `${wios.length}`);
const byDept = (suffix) => wios.find((w) => w.wioNumber.endsWith(suffix));
const arch = byDept("/ARCH"), site = byDept("/SITE"), ffe = byDept("/FFE");

r = await json("/api/dashboard/crmtl");
step("dashboard before: openWios = 4", r.body.metrics?.openWios === 4);

// ---------- escalation sweep (before mutations) ----------
r = await json("/api/jobs/wio-clock", { method: "POST" });
step("escalation sweep fires day-alert + overdue", r.status === 200 && r.body.alerts === 1 && r.body.overdue === 1,
  JSON.stringify(r.body));
r = await json("/api/jobs/wio-clock", { method: "POST" });
step("sweep dedupes within the day", r.status === 200 && r.body.alerts === 0 && r.body.overdue === 0,
  JSON.stringify(r.body));

// ---------- creation & routing ----------
r = await json("/api/wio", { method: "POST", body: JSON.stringify({ projectId: arch.projectId, departmentCode: "INTERIOR", notes: "verification" }) });
const created = r.body.wio;
step("create WIO → number from master routing", r.status === 201 && /^WIO\/\d{2}-\d{2}\/\d{3}\/INTERIOR$/.test(created?.wioNumber ?? ""), created?.wioNumber);

r = await json("/api/wio", { method: "POST", body: JSON.stringify({ projectId: arch.projectId, departmentCode: "NOPE" }) });
step("routing outside Department Master refused", r.status === 409 && /Department Master/.test(r.body.error));
quote(r.body.error);

r = await json("/api/wio", { method: "POST", body: JSON.stringify({ departmentCode: "ARCH" }) });
step("zod validation: missing projectId → 400", r.status === 400);

// ---------- checklist gate (§30) ----------
r = await json(`/api/wio/${site.id}/convert`, { method: "POST" });
step("convert blocked — exact §30 message", r.status === 422 && /checklist incomplete/.test(r.body.error) && /Brief §30/.test(r.body.error));
quote(r.body.error);

r = await json(`/api/wio/${created.id}`, { method: "PATCH", body: JSON.stringify({ boqApproved: true }) });
step("checklist item saves (draft-style update)", r.status === 200 && r.body.wio.boqApproved === true);

r = await json(`/api/wio/${ffe.id}/convert`, { method: "POST" });
const pioId = r.body.pioId;
step("checklist-complete WIO converts → PIO", r.status === 201 && /^ED\/\d{2}-\d{2}\/\d{3}$/.test(r.body.pioNumber ?? ""), r.body.pioNumber);

r = await json(`/api/wio/${ffe.id}/convert`, { method: "POST" });
step("double-convert refused (409)", r.status === 409);

// ---------- race: parallel converts on one WIO ----------
await json(`/api/wio/${arch.id}`, { method: "PATCH", body: JSON.stringify({ design3dApproved: true, sldApproved: true }) });
const race = await Promise.all([
  json(`/api/wio/${arch.id}/convert`, { method: "POST" }),
  json(`/api/wio/${arch.id}/convert`, { method: "POST" }),
]);
const codes = race.map((x) => x.status).sort();
step("race: exactly one PIO from parallel converts", codes[0] === 201 && codes[1] === 409, codes.join("/"));

// ---------- Triangle gate (§29) & approval chain ----------
r = await json(`/api/pio/${pioId}/request-approval`, { method: "POST" });
step("approval blocked — exact §29 Triangle message", r.status === 422 && /Triangle of Agreement/.test(r.body.error) && /Brief §29/.test(r.body.error));
quote(r.body.error);

r = await json(`/api/pio/${pioId}`, { method: "PATCH", body: JSON.stringify({ finalBoqSigned: true, final3dSigned: true, gfcSignedByClient: true, bomShared: true }) });
step("Triangle completes", r.status === 200 && r.body.pio.triangleComplete === true);

r = await json(`/api/pio/${pioId}/request-approval`, { method: "POST" });
const appr = r.body.pio?.approval;
step("chain starts at step 1 — Khushpreet", r.status === 201 && appr?.currentStep === 1 && /Khushpreet/.test(appr?.approverHint ?? ""),
  `step ${appr?.currentStep}/${appr?.totalSteps}`);

r = await json(`/api/pio/${pioId}/request-approval`, { method: "POST" });
step("duplicate approval request refused (409)", r.status === 409);

r = await json(`/api/workflows/${appr.instanceId}/act`, { method: "POST", body: JSON.stringify({ action: "approve" }) });
step("act refused — unresolved approver named", r.status === 409 && /Khushpreet/.test(r.body.error));
quote(r.body.error);

// ---------- API robustness ----------
r = await json(`/api/wio/not-a-uuid`, { method: "PATCH", body: JSON.stringify({ boqApproved: true }) });
step("invalid uuid → 400", r.status === 400);
r = await json(`/api/wio/00000000-0000-4000-8000-0000000000ff`, { method: "PATCH", body: JSON.stringify({ boqApproved: true }) });
step("unknown id → 404", r.status === 404);
r = await json(`/api/workflows/00000000-0000-4000-8000-0000000000ff/act`, { method: "POST", body: JSON.stringify({ action: "approve" }) });
step("unknown workflow instance → 404", r.status === 404);

// ---------- cancellation semantics ----------
r = await json(`/api/wio/${site.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
step("cancel succeeds", r.status === 200 && r.body.wio.status === "cancelled");

r = await json("/api/wio");
step("cancelled WIO leaves the clock", r.status === 200 && !r.body.wios.some((w) => w.id === site.id));

r = await json("/api/wio?view=history&q=904");
const hist = (r.body.wios ?? [])[0];
step("cancelled WIO searchable in history", r.status === 200 && hist?.wioNumber === site.wioNumber && hist?.status === "cancelled");
step("history preserves timestamps + approvals",
  Boolean(hist?.initiatedDate && hist?.targetPioDate && hist?.createdAt && hist?.updatedAt) &&
    typeof hist?.boqApproved === "boolean");

r = await json(`/api/wio/${site.id}`, { method: "PATCH", body: JSON.stringify({ boqApproved: true }) });
step("cancelled record immutable (409)", r.status === 409);
quote(r.body.error ?? "");

// ---------- notifications ----------
r = await json("/api/notifications");
const notes = r.body.notifications ?? [];
const titles = notes.map((n) => n.title).join(" | ");
const has = (s) => titles.includes(s);
step("lifecycle notifications delivered",
  has("created") && has("converted") && has("cancelled") && has("past the 15-day clock") && has("day 12"),
  `${notes.length} notifications`);
console.log("      titles:", titles.slice(0, 300));
const firstUnread = notes.find((n) => !n.readAt);
r = await json(`/api/notifications/${firstUnread.id}/read`, { method: "POST" });
const after = await json("/api/notifications?unread=1");
step("mark-read decrements unread", r.status === 200 && after.body.unread === notes.filter((n) => !n.readAt).length - 1);

// ---------- RBAC at the API (L2 baseline) ----------
r = await json("/api/audit");
step("L2 denied audit trail via API (403)", r.status === 403 && /L2/.test(r.body.error));
quote(r.body.error);

// ---------- dashboard integration ----------
r = await json("/api/dashboard/crmtl");
step("dashboard after: openWios reflects lifecycle (2)", r.body.metrics?.openWios === 2, `openWios=${r.body.metrics?.openWios}`);

// ---------- performance smoke ----------
const times = [];
for (let i = 0; i < 30; i++) {
  const t0 = performance.now();
  await fetch(BASE + "/api/wio");
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const avg = times.reduce((a, b) => a + b, 0) / times.length;
const p95 = times[Math.floor(times.length * 0.95) - 1];
console.log(`PERF  GET /api/wio ×30 — avg ${avg.toFixed(0)}ms · p95 ${p95.toFixed(0)}ms (dev server, single-connection dev DB)`);

console.log(`\n==== E2E RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail === 0 ? 0 : 1);

/*
 * Phase 3 notification-framework E2E — HTTP-only, DEV-MODE stack. Proves the
 * event→engine→in-app path, preferences suppression, mark-all-read, the
 * dispatch job, dedup, and workflow-event notifications reaching approvers.
 */
const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
let pass = 0, fail = 0;
const step = (n, ok, d) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + d : ""}`); };

const getCookie = (res) => (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith("essentia_session="))?.split(";")[0].split("=")[1] ?? null;
const call = (path, { cookie, ...init } = {}) =>
  fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: `essentia_session=${cookie}` } : {}), ...(init.headers ?? {}) } });
const as = async (email) => getCookie(await call("/api/auth/dev-login", { method: "POST", body: JSON.stringify({ email }) }));
const jget = async (path, cookie) => (await (await call(path, { cookie })).json());
const notifs = async (cookie, q = "") => (await jget(`/api/notifications${q}`, cookie)).notifications ?? [];
const countCreated = (list) => list.filter((n) => /created/.test(n.title)).length;

const L2 = await as("dev.crmtl@essentia.in");
const L1 = await as("dev.coo@essentia.in");

const projects = (await jget("/api/projects", L2)).projects ?? [];
const projectId = projects[0].id;

// 1. Publish an event → in-app delivery lands in the recipient's inbox
await call("/api/wio", { method: "POST", cookie: L2, body: JSON.stringify({ projectId, departmentCode: "ARCH" }) });
let list = await notifs(L2);
const base = countCreated(list);
step("event publish → in-app notification delivered", base >= 1, `${base} 'created' notifications`);
step("notification carries category + type", Boolean(list.find((n) => /created/.test(n.title))?.category), list[0]?.category);

// 2. Preferences: mute the 'project' category → next event suppressed
await call("/api/notifications/preferences", { method: "PUT", cookie: L2, body: JSON.stringify({ categoryPrefs: { project: false } }) });
await call("/api/wio", { method: "POST", cookie: L2, body: JSON.stringify({ projectId, departmentCode: "3D" }) });
list = await notifs(L2);
step("muted category suppresses delivery", countCreated(list) === base, `still ${countCreated(list)}`);

// 3. Re-enable → delivery resumes
await call("/api/notifications/preferences", { method: "PUT", cookie: L2, body: JSON.stringify({ categoryPrefs: { project: true } }) });
await call("/api/wio", { method: "POST", cookie: L2, body: JSON.stringify({ projectId, departmentCode: "FFE" }) });
list = await notifs(L2);
step("re-enabled category resumes delivery", countCreated(list) === base + 1, `now ${countCreated(list)}`);

// 4. Unread count + mark-all-read
let unread = (await jget("/api/notifications?status=unread", L2)).unread;
step("unread count reflects new notifications", unread >= 1, `unread=${unread}`);
await call("/api/notifications/mark-all-read", { method: "POST", cookie: L2 });
unread = (await jget("/api/notifications?status=unread", L2)).unread;
step("mark-all-read clears unread", unread === 0, `unread=${unread}`);

// 5. Filters + search
const unreadList = await notifs(L2, "?status=unread");
step("unread filter empty after mark-all-read", unreadList.length === 0);
const searchList = await notifs(L2, "?q=" + encodeURIComponent("FFE"));
step("search finds a matching notification", searchList.length >= 1, `${searchList.length} hits`);

// 6. Archive removes from the default feed
const toArchive = (await notifs(L2))[0];
await call(`/api/notifications/${toArchive.id}/archive`, { method: "POST", cookie: L2 });
const afterArchive = await notifs(L2);
step("archived item leaves the feed", !afterArchive.some((n) => n.id === toArchive.id));
step("archived item still in archived view", (await notifs(L2, "?status=archived")).some((n) => n.id === toArchive.id));

// 7. Duplicate prevention via event dedupe (clock sweep twice)
const s1 = await (await call("/api/jobs/wio-clock", { method: "POST", cookie: L2 })).json();
const s2 = await (await call("/api/jobs/wio-clock", { method: "POST", cookie: L2 })).json();
step("clock sweep dedups within the day", (s1.alerts + s1.overdue) >= 1 && s2.alerts === 0 && s2.overdue === 0,
  `run1=${s1.alerts + s1.overdue} run2=${s2.alerts + s2.overdue}`);

// 8. Dispatch job runs
const disp = await (await call("/api/jobs/notifications/dispatch", { method: "POST", cookie: L2 })).json();
step("dispatch job returns processed counts", typeof disp.processed === "number", JSON.stringify(disp));

// 9. Workflow events → approver gets an in-app notification (after sync)
await call("/api/integrations/keka/sync", { method: "POST", cookie: L1 });
const wios = await notifs(L2); // ignore
const ffe = ((await jget("/api/wio", L2)).wios ?? []).find((w) => w.wioNumber.endsWith("/FFE"));
const conv = await (await call(`/api/wio/${ffe.id}/convert`, { method: "POST", cookie: L2 })).json();
await call(`/api/pio/${conv.pioId}`, { method: "PATCH", cookie: L2, body: JSON.stringify({ finalBoqSigned: true, final3dSigned: true, gfcSignedByClient: true, bomShared: true }) });
await call(`/api/pio/${conv.pioId}/request-approval`, { method: "POST", cookie: L2 });
const KHUSH = await as("khushpreet.arora@essentia.in");
const approverInbox = await notifs(KHUSH);
step("workflow.step_pending event notifies the approver", approverInbox.some((n) => /Approval needed/.test(n.title)),
  approverInbox[0]?.title);
void wios;

console.log(`\n==== NOTIFICATIONS E2E: ${pass} passed, ${fail} failed ====`);
process.exit(fail === 0 ? 0 : 1);

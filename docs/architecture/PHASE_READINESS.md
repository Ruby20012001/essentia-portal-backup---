# Phase Readiness Assessment

Can the platform, as it stands at `v0.1-platform-foundation`, support each of the next
major workstreams? For each: what the foundation already provides, what's missing, and
a verdict. The recurring theme — **the application foundation is ready; the gating
factors are operational (real DB, scheduler, cloud creds), not architectural.**

Verdict key: 🟢 ready to start now · 🟡 start on foundation, one prereq for full build ·
🔴 blocked until a named prerequisite lands.

---

## At a glance

| Workstream | Verdict | Primary prerequisite |
|---|:--:|---|
| **Phase 4 — Workflow generalization** | 🟢 | none (pure code) |
| **BOQ engine** | 🟢 | none (pure code); nicer after Phase 4 |
| **Procurement (VRN/WO/PO/GRN)** | 🟢 | none (pure code, large); uses Phase 4 workflows |
| **Factory** | 🟡 | live Keka for real HODs; stations 8–9 sign-off (A-03) |
| **Executive Dashboard** | 🟡 | a scheduler + upstream modules feeding the numbers |
| **CRM Intelligence** | 🟡 | Phase 6 (AI completion) + Anthropic prod key |
| **VisionCAM** | 🔴 | AWS S3 + React Native app scaffold |

## Phase 4 — Workflow Engine generalization 🟢

**Provided:** the engine already exists (`workflow_definition/step/instance/action`) with
compare-and-swap concurrency and exact-approver identity, and it drives the PIO chain
end-to-end. No external dependency.
**Work:** extend definitions so WOs, BOQ, letters, and CRM reuse it (conditions, SLAs,
timeouts, reminders, delegation, parallel/sequential steps).
**Verdict: start immediately.** This is the lowest-risk next step and unblocks the
approval needs of Procurement, BOQ, and CRM.

## BOQ engine 🟢

**Provided:** the §29/§30 gates in `wio`/`pio` already read Triangle flags (BOQ = 3D =
GFC = BOM); the BOQ leg just needs a producing module. RBAC/RLS/audit/events are free.
**Work:** `services/boq` + schema for line items + (optional) an approval definition.
**Verdict: ready.** Best sequenced *after* Phase 4 if BOQ approvals should use the
generalized engine rather than a bespoke chain.

## Procurement (VRN / WO / PO / GRN) 🟢

**Provided:** the `proc` schema exists; document-number formats are defined; and the
**20% coordination charge is already a generated column** that no one can delete.
**Work:** a large module — VRN/WO/PO/GRN services, the three-quotes rule (via the
`blocking` pattern), and approval chains (Phase 4 engine).
**Verdict: ready (pure code), sizeable.** No external blocker; do Phase 4 first so the
WO/PO approvals reuse the generalized workflow.

## Factory 🟡

**Provided:** `departments` (the 7+2 factory model), factory stations, PIO assignments,
and "No PIO → no factory work" already enforced.
**Gaps:** real station HODs come from **live Keka** (the fixture is fine for dev);
**stations 8–9 are reserved** pending business confirmation (A-03).
**Verdict: build on fixtures now; flip to live data when Keka credentials and the
8–9 decision arrive.** No architectural blocker.

## Executive Dashboard 🟡

**Provided:** the dashboard pattern is proven (CRM TL), the event feed exists, and the
AR ladder routing (45/60/90-day) is seeded.
**Gaps:** the **Founder Morning Brief** needs a **scheduler** to auto-generate at 6:30am
(no cadence owner yet — A-14), and the "7 numbers" need **upstream modules** (procurement,
factory, finance) actually producing data, plus a **real DB** with real volume.
**Verdict: the shell is ready; meaningful numbers depend on the scheduler and the
modules above it.** Sequence it after those.

## CRM Intelligence 🟡

**Provided:** the AI abstraction with a live Anthropic provider, `pgvector` in the schema
for the Knowledge Library, the event bus, and the scroll-to-send gate concept.
**Gaps:** **Phase 6 (AI completion)** — streaming and the modular prompt library — and an
**Anthropic production key**; the Communication Spine and Family Profile are net-new modules.
**Verdict: prototype now on a dev key; full build wants Phase 6 first** so the Spine,
Knowledge Library, and Priority Signals share a complete AI service.

## VisionCAM 🔴

**Provided:** the event bus can carry the billing trigger; RBAC/RLS/audit are ready.
**Gaps:** **AWS S3** for photo storage (only env placeholders exist), a **React Native
offline-first app** (a brand-new surface), and a file-upload/photo service.
**Verdict: blocked until S3 is provisioned and the mobile scaffold exists.** The web
side (photo model + "photo required before billing" event) can be prepared in parallel,
but the Velocity-Gate-1 capability needs the cloud + mobile pieces.

---

## Platform gaps to address first (recommended order)

Independent of which module is chosen next, these unblock the *most* downstream work:

1. **Provision real PostgreSQL** (TD-02) — turns the prototype into a persistent system;
   prerequisite for every dashboard's real numbers, backups, and DR. *Stage 0.*
2. **Build the scheduler / auto-pilot** (A-14) — the job routes (`wio-clock`,
   `keka-sync`, `notifications/dispatch`, and the future Morning Brief / VRN revocation /
   Weekly Pulse / digests) have **no cadence owner**. This single capability gates
   Velocity Gates 2, 4, 6, 7 and the Executive Dashboard. **Highest-leverage platform gap.**
3. **CI/CD** (TD-05) — before multiple modules land in parallel.
4. **Cloud credentials in parallel** — S3 (VisionCAM), Entra (SSO), live Keka (Factory,
   real org), Anthropic prod (CRM Intelligence). Each is a config flip into an existing slot.
5. **Phase 6 AI completion** — before the CRM Intelligence depth work.

**Recommended immediate path:** **Phase 4 (Workflow generalization)** — it is 🟢, needs
nothing external, and directly de-risks Procurement, BOQ, and CRM. Run **Stage 0
hygiene (real DB + CI) and the scheduler** alongside it, since they gate the widest set
of later modules.

# TODO

> Living backlog. Newest priorities on top. When something ships, move it to
> [`CHANGELOG.md`](CHANGELOG.md) with its commit ref. Deep tech-debt register:
> [`docs/architecture/TECH_DEBT.md`](docs/architecture/TECH_DEBT.md); roadmap:
> [`docs/architecture/ROADMAP.md`](docs/architecture/ROADMAP.md).

## ✅ Phase 4 frontend — COMPLETE (2026-07-22)
All 10 workflow UI screens shipped and verified. This arc closed S7 Active
Delegations, S8 SLA Monitor, S9 Notifications Center, and S5 Workflow Builder
(the last, with its approved read+write backend). See [`CHANGELOG.md`](CHANGELOG.md).
Backend stays frozen again except where a future screen genuinely needs a read model.

## 🟡 Next candidates (no longer workflow-frontend)
- **Wire the "Edit" journeys** end-to-end with real definitions once business
  authors start building chains (the builder is live; seed real approval flows).
- Velocity Gates below are the highest-value remaining product work.
- Re-check every new screen at 320 / 768 / 1024 / 1440 for horizontal scroll (standing rule).

## 🟢 Velocity Gates still open (Brief §35)
- **#1 VisionCAM billing** live on every active site (photo required before any billing milestone).
- **#5 EH discount control gate** across all 3 Experience Centres.
- **#8 Communication Spine** — Welcome Letter within 4 hrs of first instalment
  (TL must scroll to the bottom before the send button activates).

## 🔵 Integration wiring (turns honest `not_wired` into real removals — Gate #4 completion)
- Microsoft Graph (Teams removal, full SSO revoke, mail auto-responder).
- WhatsApp Cloud API (WhatsApp removal).
- Telephony (call forwarding).
These are recorded `not_wired` today by design; wiring them is real work.

## ⚪ Standing hygiene
- Keep the six memory docs current each session; regenerate [`HANDOFF.md`](HANDOFF.md) before context runs out.
- New migration ⇒ add to `db/lib.mjs` `DEFAULT_FILES` **and** a `db/validate.mjs` check.
- New `publishEvent` ⇒ supply every `{{var}}` its db/010 template uses (+ a regression test).
- Never global-`sed` over `db/validate.mjs` (short id fragments recur; corrupts unrelated checks).

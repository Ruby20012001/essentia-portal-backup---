# HANDOFF → moved

"Resume here" state — current task, blockers, next action, and the gotchas that
have cost real time — now lives in **[`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md)**
(§5 Current work, §7 Known issues, §8 Recovery information).

Consolidated on 2026-07-28 so the project has one memory system rather than two
that drift apart.

## Resume prompt (paste into a fresh session)

> Read `CLAUDE.md`, then `docs/PROJECT_MEMORY.md`, then `RUNBOOK.md`.
> The baseline is `platform-baseline-v1` (**not `main`** — main is an empty stub).
> Phase 4 and 3 of 4 Phase-1 Core screens are complete; the workflow backend is
> frozen — extend a read model only if a new screen genuinely needs it, and
> stop-and-report before adding write backend. Verify the green baseline first
> (harness 112/0 · tsc 0 · unit 165/165 · lint clean), then pick the next task
> from §9. Build on a `feat/*` branch, verify, merge `--no-ff`.

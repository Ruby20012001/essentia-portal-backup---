# Reference specs — from "RUBY COMPLETE PORTAL PACKAGE"

Detailed source specs, kept for reference. **These do not override the live repo
docs** — the repo has already evolved past the package's seed copies.

## What's authoritative where
| Topic | Authoritative source | Package copy |
|---|---|---|
| Project brain / brand / vocabulary | **repo [`CLAUDE.md`](../../CLAUDE.md)** (reconciled to the group brief 2026-07-22: no "luxury", "production facility", dark theme, Lato) | `03_PROJECT_BRAIN/CLAUDE.md` = the *original seed* (luxury / factory / Cold Coffee / Cormorant) — **superseded, do not use** |
| Database schema | **repo [`db/001_essentia_schema.sql`](../../db/001_essentia_schema.sql)** (v1.1 — fixes 3 statements Postgres rejects in v1.0) | `02_DATABASE/001…sql` = v1.0, **broken SQL, superseded** |
| Business/brand facts & vocabulary | **`Portal_Group_Essentia_Complete_Brief.html`** (the group brief — bans "luxury", uses "production facility") | — |
| Detailed §1–39 module/process spec | [`../Portal_Complete_Brief.html`](../Portal_Complete_Brief.html) (already in repo) | `01_INTELLIGENCE/…39_Sections.html` (same doc; **older vocabulary — factory/luxury** — read for process detail, not brand) |

## Genuinely-new references added here
- **`Portal_UI_18_Screens_BuildSequence.html`** — the 18-screen UI build order with
  Build-Week + Phase tags and value flags. The package's own note: *"Folder 04 — the
  UI screens — is what you'll open most."* Our roadmap driver.
- **`EssentiaOS_*`** (×3) — team partnership, Ruby's JD, tools & revised team.
- **`PACKAGE_START_HERE.html`** — the package's own guide.

## ⚠️ Known conflict
The **39-section brief** and the **group brief** disagree on brand vocabulary
(39-section still says *factory / luxury*; the group brief bans them). The **group
brief wins on brand/vocabulary**; the 39-section wins on detailed process/§-refs.
Tracked alongside [`../BRIEF_DISCREPANCIES.md`](../BRIEF_DISCREPANCIES.md).

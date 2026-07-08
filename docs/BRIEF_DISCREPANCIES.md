# Brief ↔ CLAUDE.md ↔ Schema — Discrepancy Register

Produced 2026-07-06 from a full extraction pass over
`docs/Portal_Complete_Brief.html`.

## ✅ Resolved by Monica — 2026-07-06 (foundation freeze)

- **Item 1 (departments):** portal runs on the 24 seeded departments until
  officially revised; `public.departments` is the single source of truth and
  every module references it (implemented in db/004 + Department Master
  service).
- **Item 2 (factory):** 7 stations stand; 8–9 exist as `Reserved — Awaiting
  Business Confirmation` rows; the station list is data-driven.
- **Item 4 (L0-L3):** hierarchy approved (L0 Founders · L1 Senior Leadership
  · L2 HOD/TL · L3 Team); permissions moved to a configurable DB engine with
  12 actions; all decisions audited. Individual L2/L3 rows remain
  conservative defaults pending Ruby's row-by-row review (A-06).
- **Item 8 (scroll-to-send):** kept, per the earlier ruling in this file.
- **Item 10 (AI stack):** proceed per CLAUDE.md with a provider-replaceable
  abstraction (Anthropic active; Azure OpenAI / Copilot registered slots).
- **Item 11 (EH targets):** stay empty until business values are finalized;
  no placeholder financials.

## Still needs a decision

| # | Topic | The conflict | Interim engineering choice |
|---|---|---|---|
| 1 | **The 22 departments** | Brief asserts "22 departments, 490 people" (§36, §38) but never enumerates the list anywhere. | `db/002` seeds the 24 departments the brief actually names (§26 state machine, §30 WIO recipients, §27 ECs), each with a section citation. |
| 2 | **Factory: 9 or 7?** | "All 9 Depts" (§10, §12) vs "All 7 Station HODs" (§26), 7 named HODs (§39), 7-station PPC tracker (§38). Only 7 stations are ever named. "Pottery" (CLAUDE.md) appears nowhere. | Seeded the 7 named stations. Slots 8-9 added when the factory names them. |
| 3 | **HOD→station mapping** | §39 names 7 factory HODs but maps only 3 (Hitesh=Carpentry, Fiyanshu=Stone, Kundan=Polish). Rakesh / Pryanka / Rishabh / Ritesh unmapped. | `hod_id` left NULL pending Keka import + mapping. |
| 4 | **L0-L3 definitions** | Brief uses "L0-L3 information fencing" twice but never defines levels or a permission matrix — §38 itself flags the gap. CLAUDE.md defines the levels; brief §3 separately mentions "6 access levels (RBAC)" that are never labeled. | `db/003` seeds a conservative matrix from CLAUDE.md levels + explicit brief rules (§5, §26, §36). RLS enforces L0/L1 + project-team membership today. |
| 5 | **Headcount** | §3 says "Internal Staff — 850+"; §32/§36/§39 say 490 (scaling to 800). | None needed for code; flag for the staff import. |
| 6 | **NH8 size** | §1: 1,50,000 sqft · §21: 1,77,000 sqft · CLAUDE.md: 177,000 sqft. | Cosmetic; affects copy only. |
| 7 | **Craftspeople count** | CLAUDE.md "145 craftspeople" — not in brief ("150+ craftsmen", "100+ floor team"). | Copy only. |
| 8 | **Scroll-to-send gate** | CLAUDE.md mandates the TL must scroll to the letter's bottom before Send activates. Brief only says "TL reviews and sends" (§4, §28). | **Keeping the gate** — CLAUDE.md is the stricter, binding spec (`portal.communication_spine.scroll_complete` already models it). |
| 9 | **Mumbai Store Lead** | Unnamed in brief (§27); Gurugram=Nishi, Sultanpur=Nikita Basera. | EH_MUM department seeded without a lead. |
| 10 | **AI stack** | Brief (§2): Microsoft 365 Copilot primary, Claude secondary-modular; no pgvector mention. CLAUDE.md/schema: Anthropic API + pgvector Knowledge Library. | Following CLAUDE.md/schema (they post-date the brief); confirm with Eshan's integration plan. |
| 11 | **EH targets** | Brief gives Year-1 incentive activation thresholds (₹1.5/1.2/1.0 Cr), not monthly EC targets. | `eh.experience_centres.target_monthly` NULL until targets are set. |

## Confirmed by the brief (no action)

- 58 active projects; 11-month EE build cycle; Weekly Pulse every Friday,
  auto-drafted 5am from the site Saturday Checklist, three-line format (§28).
- WIO 15-day conversion window owned by the TL; Day-12 alert; Day-15 lapse
  requires documented restart (§30).
- Triangle check before every factory PIO is **Manika Nanda's** named gate
  (§26, §30); PIO signatures: Khushpreet → Deepak Ji → Hardesh.
- Anti-busy-looking protocol incl. camera-roll uploads rejected (live capture
  only), generic-report flag, >24h late-entry flag, 14-day quote escalation,
  Family Profile completeness <70 = red to TL + Deepak Ji (§39).
- Exit protocol at 11:59pm removes Teams, WhatsApp groups, SSO, email, phone
  forwarding simultaneously (§36).
- Rimadesio is not sold in Mumbai — the portal must block Mumbai CAs from
  generating Rimadesio quotes (§27).

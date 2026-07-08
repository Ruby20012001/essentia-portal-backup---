# Business Traceability Matrix

Every implemented business requirement traced end-to-end:
**Requirement → Module → Database → API → UI → Test coverage.** This proves each
capability is wired through all layers (not just a screen or just a table), and shows
exactly where planned modules will attach.

Legend: ✅ built & verified · 🟡 partial · ⬜ planned (foundation ready).
Brief section references in the `§` column.

---

## Implemented (traceable end-to-end)

| # | Requirement | § | Module (`lib/services` etc.) | Database | API | UI | Tests |
|--|--|--|--|--|--|--|--|
| 1 | **WIO clock, all departments** (Velocity Gate 3) | 30 | `wio`, `departments` | `ee.wio` + `wio_clock` view, `departments` | `/api/wio`, `/api/wio/:id`, `/api/departments` | WIO/PIO Hub, `WioClockTable`, dashboard | harness (dept routing) · `wio-lifecycle` E2E |
| 2 | **No PIO → no factory work; §30 convert gate** | 30 | `wio.convertWioToPio`, `pio` | `ee.wio`, `pio` | `/api/wio/:id/convert` | `WioPioHub`, `ToggleChip` | harness · `wio-lifecycle` E2E |
| 3 | **Triangle of Agreement before PIO** | 29 | `pio.requestPioApproval`, `blocking` | `pio` (triangle flags) | `/api/pio/:id/request-approval` | `PioTable`, toggles | harness (gate refusal) |
| 4 | **PIO approval chain, exact-approver** | 26 | `workflows` (CAS) | `workflow_definition/step/instance/action` | `/api/workflows/:id/act`, `/api/pio` | approval via Notification Center | harness (CAS advance, approver resolution) |
| 5 | **RBAC, deny-by-default (L0–L3)** | 39 | `permissions`, `config` | `role`, `role_permission` | enforced on **all** routes | nav/action gating | harness (permission) · `auth` E2E (level from DB) |
| 6 | **Authentication & sessions** | — | `auth/*` | `users`, `sessions` | `/api/auth/login·logout·session·sessions·me` | login page, `LoginForm` | `auth` E2E · unit (`errors`) |
| 7 | **Keka org sync + approver resolution** | — | `integrations/keka` | `users`, `sync_runs`, hierarchy | `/api/integrations/keka/sync`, `/api/jobs/keka-sync` | Keka status | harness (approver) · `keka-sync` E2E |
| 8 | **Event-driven notifications** | — | `notifications/{events,engine,channels}` | `events`, `event_routes`, `notification_deliveries/_preferences`, `notifications` | `/api/notifications/*`, `/api/jobs/notifications/dispatch` | `NotificationCenter` | harness (routing/dedupe/dead-letter) · `notifications` E2E · unit (render) |
| 9 | **Department Master (22 depts; factory 7+2)** | 39/30 | `departments`, `factory` | `departments`, factory stations | `/api/departments`, `/api/factory/stations` | factory page | harness (routing rejects unknown dept) |
| 10 | **Clock escalation / AR ladder** | 30/36 | `wio` (clock), events | `events` (`wio.clock_*`, `ar.overdue`) | `/api/jobs/wio-clock` | dashboard priority band | harness (delivery + dead-letter) |
| 11 | **Anti-busy-looking blocking rules** | 39 | `blocking` | `config` thresholds | enforced in `wio`/`pio` | inline error messages | harness (blocking) |
| 12 | **Audit everything** | — | `audit`, `audit-query` | `audit` schema (partitioned, insert-only) | `/api/audit` | audit query | harness (audit write) |
| 13 | **CRM TL dashboard / priority signals** | 37/39 | `dashboard` | project/WIO reads | `/api/dashboard/crmtl` | dashboard page + cards/band/table | unit (`render`) |

## Partial

| # | Requirement | § | Status |
|--|--|--|--|
| 14 | **AI service layer** (Communication Spine, Knowledge Library, signals) | 28 | 🟡 provider abstraction + Anthropic live (`lib/ai`); no business module/API/UI yet; prompt library pending |
| 15 | **Notification channels beyond in-app** | — | 🟡 Teams/email code-complete + tested, credential-gated; WhatsApp/SMS/Push are slots |
| 16 | **Entra SSO (staff)** | — | 🟡 OIDC redirect + session mint done; JWKS validation pending (A-16) |

## Planned (foundation ready — attach points identified)

| # | Requirement | § | Gate | Where it attaches |
|--|--|--|--|--|
| 17 | **VisionCAM** (photo-gated billing) | 3/35 | Gate 1 | new `services/visioncam` + S3; events already support `*.photo_*`; billing trigger via event bus |
| 18 | **BOQ engine** (Triangle's BOQ leg) | 29 | — | `services/boq`; feeds the §29/§30 gates already in `wio`/`pio` |
| 19 | **Procurement (VRN/WO/PO/GRN)** | 33 | — | `proc` schema exists; **20% coordination charge already modelled as a generated column**; needs module/API/UI |
| 20 | **Communication Spine** (AI letters + scroll-to-send) | 28 | Gate 8 | `services/crm` on `lib/ai`; scroll-to-send gate is a UI rule |
| 21 | **Founder Morning Brief** (the 7 numbers) | 37 | Gate 6 | `services/exec` reading events + AR ladder (routing seeded) |
| 22 | **EH discount control gate** | — | Gate 5 | `eh` schema + `blocking` rule pattern |
| 23 | **Weekly Pulse / Succession / VRN revocation** | 35 | Gates 2,4,7 | scheduler (auto-pilot) + existing event/workflow machinery |

## What the matrix shows

- **Every built requirement is present in all five layers** — none is a UI-only mock or
  an orphan table. The chain module → DB → API → UI → test holds for rows 1–13.
- **Test coverage is real but uneven by design:** business/workflow invariants are proven
  in the DB harness (deterministic, no server) and HTTP E2Es; UI has render-level unit
  tests. The heaviest-risk logic (gates, CAS, dedupe, dead-letter, approver identity) has
  the deepest coverage.
- **Planned modules have explicit attach points** — each plugs into the existing RBAC
  gate, RLS scope, `publishEvent()`, and (where approvals apply) the workflow engine, so
  none requires structural rework. The clearest example: the **20% coordination charge**
  is already a generated column in `proc`, waiting for the procurement module to expose it.

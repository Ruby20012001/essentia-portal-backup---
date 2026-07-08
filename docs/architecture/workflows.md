# Workflow, Approval & Escalation Flows

The order spine's first segment: work initiation (WIO) → production
initiation (PIO) → the §26 approval chain. Two permanent gates cannot be
bypassed: the §30 three-item checklist and the §29 Triangle of Agreement.

## WIO lifecycle

```mermaid
stateDiagram-v2
  [*] --> initiated : createWio (FK-routed to Master)\n15-day clock starts
  initiated --> initiated : checklist toggles\n(BOQ / 3D / SLD)
  initiated --> on_hold : status change
  on_hold --> initiated : resume
  initiated --> cancelled : cancel (history preserved)
  initiated --> converted_to_pio : convert\n[§30 gate: all 3 approved]
  converted_to_pio --> [*]
  cancelled --> [*] : immutable in history
```

- **§30 gate**: `convertWioToPio` refuses with the exact missing items
  ("Approved BOQ + Approved 3D pending…") until all three are checked.
- **Clock RAG** (view `ee.wio_clock`): green >5d, amber ≤5d, red ≤2d,
  overdue past target. Row-locked convert prevents a double-PIO race.
- **Cancellation** never deletes — the row leaves the clock view but stays
  searchable in history with all timestamps, approvals, and audit intact.

## PIO lifecycle

```mermaid
stateDiagram-v2
  [*] --> initiated : convert from WIO\n45-day factory clock
  initiated --> initiated : Triangle toggles\n(final BOQ · final 3D · GFC signed · BOM shared)
  initiated --> pending_approval : request-approval\n[§29 gate: Triangle complete]
  pending_approval --> pending_approval : step approved\n(advance)
  pending_approval --> approved : final step approved
  pending_approval --> rejected : any step rejected
  approved --> [*]
  rejected --> [*]
```

- **§29 gate**: `requestPioApproval` refuses until all four Triangle items
  align (BOQ = 3D = client-signed GFC = shared BOM).

## Approval flow (workflow engine, generic)

```mermaid
sequenceDiagram
  participant TL as CRM TL
  participant PIO as PIO service
  participant WF as Workflow engine
  participant K as Khushpreet
  participant D as Deepak Ji
  participant H as Hardesh
  participant BUS as Event bus

  TL->>PIO: request-approval (Triangle complete)
  PIO->>WF: startWorkflow(pio_approval, pioId)
  WF->>BUS: publishEvent(workflow.step_pending)
  BUS-->>K: in-app "Approval needed" (+ Teams if configured)
  K->>WF: act(approve)  [CAS: pending & step=1]
  WF->>BUS: publishEvent(workflow.step_pending)  %% step 2
  BUS-->>D: notify
  D->>WF: act(approve)
  WF->>BUS: publishEvent(workflow.step_pending)  %% step 3
  BUS-->>H: notify
  H->>WF: act(approve)  [final]
  WF->>BUS: publishEvent(workflow.approved)
  BUS-->>TL: "PIO approved"
```

- **Concurrency**: the decision is a single compare-and-swap
  (`UPDATE … WHERE status='pending' AND current_step=$n`) — a concurrent
  second decision matches zero rows and is refused (409). No `FOR UPDATE`.
- **Exact-approver**: a step belongs to a named person (resolved from
  `approver_email` at Keka sync). Wrong approver → 403; unresolved → 409
  naming the intended person.

## Escalation flow (§30 clock)

```mermaid
flowchart LR
  J["POST /api/jobs/wio-clock\n(scheduler / ops)"] --> Q{"WIO within alert\nwindow or overdue?"}
  Q -- "day 12" --> A["publishEvent(wio.clock_alert)\ndedupeKey per WIO per day"]
  Q -- "overdue" --> B["publishEvent(wio.clock_overdue)"]
  A --> E[Event bus]
  B --> E
  E --> N["in-app + email (if live)"]
  E -. "same key same day" .-> X[deduped, no re-alert]
```

- Escalation targets the project's CRM TL (§30 ownership). Dedup is now
  centralized in the event bus (`dedupe_key`), replacing the old manual guard.
- AR ladder (§36: 45d→TL, 60d→Deepak Ji, 90d→founders) is modelled via
  `ar.overdue` events + config `ar.escalation_days` (routing seeded).

## Notification flow

Every flow above emits **domain events**, never direct sends. The event bus →
notification engine → channels pipeline is documented in
[events-notifications.md](events-notifications.md).

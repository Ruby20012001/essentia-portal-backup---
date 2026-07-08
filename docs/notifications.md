# Event-Driven Notification Framework (Platform Phase 3)

A shared platform capability. **No module sends notifications directly** —
modules publish domain events; the engine decides who is notified, on which
channels, honouring preferences.

```
Business action → publishEvent() → portal.events → engine (route + recipients
+ preferences) → per-channel deliveries (retry/backoff/dead-letter) → channels
```

## Publishing (the only thing modules do)

```ts
import { publishEvent } from "@/lib/notifications";
await publishEvent({
  type: "wio.created", category: "project", entityType: "wio",
  entityId: wio.id, entityRef: wio.wioNumber, actorId: user.id,
  payload: { recipientId: crmtlId, wioNumber, projectCode, department, days },
  // dedupeKey: "…" — a repeat with the same key is skipped
});
```

## Event catalogue (`portal.event_routes` — data-driven)

| Event type | Category | Notification type | Recipient | Default channels |
|---|---|---|---|---|
| `wio.created` | project | assignment | explicit (project TL) | in_app |
| `wio.converted` | project | workflow_completed | explicit | in_app |
| `wio.cancelled` | project | workflow_cancelled | explicit | in_app |
| `wio.clock_alert` | project | deadline | explicit | in_app, email |
| `wio.clock_overdue` | project | delay | explicit | in_app, email |
| `workflow.step_pending` | approval | approval_request | current-step approver | in_app, teams |
| `workflow.approved` | approval | approval_granted | workflow starter | in_app |
| `workflow.rejected` | approval | approval_rejected | workflow starter | in_app |
| `ar.overdue` | project | escalation | explicit | in_app, email |
| `system.alert` | system | system_alert | explicit | in_app |

Adding an event = one `event_routes` row (+ a template). Recipient strategies:
`explicit` (payload.recipientId), `actor`, `project_tl`, `workflow_step_approver`,
`workflow_started_by`.

## Event fields (`portal.events`)

id · event_type · category (workflow/approval/user/project/department/system/ai/integration) ·
entity_type · entity_id · entity_ref · actor_id · department_id · priority ·
payload · correlation_id · dedupe_key · created_at. (Retry count lives on the
**delivery**, where it belongs — the event is immutable.)

## Channels (`lib/notifications/channels`, config-selected)

| Channel | Status | Notes |
|---|---|---|
| **In-app** | **Live** | Writes the inbox (`portal.notifications`); the Notification Center. |
| **Teams** | Code-complete, credential-gated | Real Adaptive Card built + posted to `teams.webhook_url`. Fails into retry/DLQ without a webhook. |
| **Email** | Code-complete, credential-gated | Real branded HTML built; sends via `SMTP_URL` (A-21). |
| WhatsApp / SMS / Push | Prepared slots | Fail-loud until their gateway is provisioned (A-22). |

`notifications.channels_live` config gates which channels actually attempt.

## Delivery engine (`portal.notification_deliveries`)

One row per (event × recipient × channel) — `UNIQUE` prevents duplicates.
Lifecycle: `pending → sent | failed → (backoff) → pending … → dead`. Exponential
backoff (`base·2^attempt`, capped); after `max_attempts` → **dead-letter**.
Quiet hours defer interruptive channels (urgent bypasses). `sent`/`read`/
`acknowledged`/`archived`/`expires` tracked. Retries processed by
`POST /api/jobs/notifications/dispatch` (auto-pilot cadence, A-14).

## Preferences (`portal.notification_preferences`)

Per user: `channels` (opt-in per channel), `category_prefs` (mute a category —
system always delivers), `quiet_hours_start/end`, `digest_frequency`. Set via
`GET/PUT /api/notifications/preferences`. In-app is always allowed unless the
category is muted.

## Notification Center ([components/notifications/NotificationCenter.tsx](../frontend/components/notifications/NotificationCenter.tsx))

Reusable header component: bell + live unread badge (30s poll), filters
(all/unread), search, per-item read/archive, mark-all-read, deep links.
Consumes the inbox only — knows nothing about individual modules.

## API

`GET /api/notifications?status=&category=&q=` · `POST /api/notifications/{id}/read`
· `/archive` · `/acknowledge` · `POST /api/notifications/mark-all-read` ·
`GET|PUT /api/notifications/preferences` · `POST /api/jobs/notifications/dispatch`.

## Audit

Every delivery attempt writes `audit.log` (`NOTIFICATION_DELIVERY`: recipient,
channel, event, type, status); dead-letters also write `NOTIFICATION_DEAD_LETTER`.

## Sequence (approval request)

1. `actOnWorkflow` advances a step → `publishEvent("workflow.step_pending", {instanceId,…})`.
2. Bus persists the event → `dispatchEvent`.
3. Route `workflow.step_pending` → recipient = current-step approver; channels in_app(+teams).
4. Render `approval_request`; per channel: check live-config + preference + quiet hours → create delivery → attempt.
5. In-app INSERT → inbox row; the approver's Notification Center badge increments.
6. Teams (if configured) posts an Adaptive Card with a Review deep link; else the delivery retries then dead-letters.

## Known gaps / assumptions

- **A-21** Email SMTP transport not wired (HTML is built + tested; needs `SMTP_URL` + a transport lib).
- **A-22** WhatsApp/SMS/Push are prepared interface slots (need Twilio / FCM-APNs).
- **Dashboard event-sourcing**: dashboard priority signals still query modules directly; migrating them to consume events is a later optimization (the Notification Center already consumes the event-fed inbox).
- **Digest frequency** is stored but the digest builder (daily/weekly roll-up) is not yet built — a scheduled consumer for the auto-pilot module.

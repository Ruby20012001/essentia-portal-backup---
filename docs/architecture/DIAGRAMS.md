# Architecture Diagrams

Self-contained Mermaid diagrams for the RC-1 review. These render in GitHub and most
Markdown viewers. Subsystem docs carry additional detail; this file is the single
visual reference.

Index: [System](#1-overall-system-architecture) · [Database](#2-database-relationships) ·
[Auth](#3-authentication-flow) · [WIO](#4-wio-lifecycle) · [PIO](#5-pio-lifecycle) ·
[Event Bus](#6-event-bus) · [Notifications](#7-notification-flow) · [Keka](#8-keka-sync) ·
[RBAC](#9-rbac-hierarchy) · [API](#10-api-layer)

---

## 1. Overall System Architecture

```mermaid
flowchart TB
  subgraph Client
    B["Browser (Next.js pages)"]
  end
  subgraph Edge
    MW["middleware.ts — session gate"]
  end
  subgraph Server["Next.js server (lib/)"]
    RH["Route handlers (32)"]
    subgraph Services["Domain services"]
      SVC["wio · pio · workflows · permissions<br/>config · departments · factory · dashboard"]
    end
    WF["Workflow engine<br/>(CAS · exact-approver)"]
    BUS["Event bus<br/>publishEvent()"]
    NENG["Notification engine<br/>route · prefs · retry/DLQ"]
    RBAC["RBAC gate<br/>(deny-by-default)"]
    AUD["Audit choke point"]
    DBL["db.ts — withUserContext<br/>(RLS GUCs + essentia_app role)"]
  end
  PG[("PostgreSQL 15<br/>7 schemas · 62 tables<br/>RLS policies")]
  subgraph External["External edges (provider slots)"]
    ENTRA["Entra ID"]
    KEKA["Keka HRMS"]
    AI["Anthropic / Azure / Copilot"]
    CH["Teams · Email · SMS · Push"]
  end

  B --> MW --> RH
  RH --> RBAC --> SVC
  SVC --> WF
  SVC --> BUS --> NENG --> CH
  SVC --> AUD
  SVC --> DBL --> PG
  WF --> DBL
  NENG --> DBL
  AUD --> DBL
  RH -. auth .-> ENTRA
  SVC -. sync .-> KEKA
  SVC -. inference .-> AI
```

## 2. Database Relationships

Golden-thread core (`project_code` links everything). Full schema in
[database.md](database.md).

```mermaid
erDiagram
  DEPARTMENTS  ||--o{ USERS         : "staffed by"
  DEPARTMENTS  ||--o{ WIO           : "routes"
  PROJECTS     ||--o{ WIO           : "has"
  WIO          ||--o| PIO           : "converts to"
  PROJECTS     ||--o{ PIO           : "has"
  USERS        ||--o{ WIO           : "owns (CRM TL)"
  PIO          ||--o| WORKFLOW_INSTANCE : "triggers"
  WORKFLOW_DEFINITION ||--o{ WORKFLOW_STEP : "has"
  WORKFLOW_INSTANCE   ||--o{ WORKFLOW_ACTION : "records"
  USERS        ||--o{ WORKFLOW_ACTION : "acts"
  ROLE         ||--o{ ROLE_PERMISSION : "grants"
  USERS        }o--|| ROLE            : "assigned"
  ANY_ENTITY   ||--o{ EVENTS          : "publishes"
  EVENTS       ||--o{ NOTIFICATION_DELIVERY : "fans out to"
  USERS        ||--o{ NOTIFICATION_DELIVERY : "recipient"
  USERS        ||--o{ NOTIFICATION_PREFERENCE : "configures"
  EVENTS       ||--o{ EVENT_ROUTE     : "matched by"

  PROJECTS {
    string project_code PK "ED/YY-YY/NNN"
  }
  WIO {
    string wio_no PK "WIO/YY-YY/NNN/DEPT"
  }
  PIO {
    string pio_no PK "ED/YY-YY/NNN"
  }
  EVENTS {
    uuid id PK
    string dedupe_key UK
  }
```

## 3. Authentication Flow

```mermaid
sequenceDiagram
  participant U as Browser
  participant MW as middleware.ts
  participant API as /api/auth/login
  participant P as Auth provider
  participant DB as Postgres
  U->>MW: request protected route
  alt no valid session
    MW-->>U: 401 (API) / 307 -> /login (page)
  end
  U->>API: POST credentials
  API->>P: authenticate (local-password | entra)
  P->>DB: verify user (scrypt) / OIDC claims
  DB-->>P: user + access level
  API->>DB: mint session (SHA-256 token, server-side)
  API-->>U: Set-Cookie essentia_session (httpOnly, secure*)
  U->>MW: subsequent request (cookie)
  MW->>DB: validate session token
  MW-->>U: allow -> handler runs withUserContext
```

## 4. WIO Lifecycle

```mermaid
stateDiagram-v2
  [*] --> initiated : createWio (FK-routed to Dept Master, 15-day clock)
  initiated --> initiated : checklist toggles (BOQ / 3D / SLD)
  initiated --> on_hold : hold
  on_hold --> initiated : resume
  initiated --> cancelled : cancel (history preserved)
  initiated --> converted_to_pio : convert [§30 gate: all 3 approved]
  converted_to_pio --> [*]
  cancelled --> [*]
```

## 5. PIO Lifecycle

```mermaid
stateDiagram-v2
  [*] --> initiated : convert from WIO (45-day factory clock)
  initiated --> initiated : Triangle toggles (final BOQ / final 3D / GFC signed / BOM shared)
  initiated --> pending_approval : request-approval [§29 gate: Triangle complete]
  pending_approval --> pending_approval : step approved (advance via CAS)
  pending_approval --> approved : final step approved
  pending_approval --> rejected : any step rejected
  approved --> [*]
  rejected --> [*]
```

## 6. Event Bus

```mermaid
flowchart LR
  P["Publishers<br/>wio.ts · workflows.ts"] --> PUB["publishEvent()"]
  PUB --> DK{"dedupe_key<br/>exists?"}
  DK -- yes --> SKIP["return existing (no-op)"]
  DK -- no --> EV[("portal.events<br/>immutable")]
  EV --> RT["event_routes lookup"]
  RT --> RC["resolveRecipients (strategy)"]
  RC --> PF["preferences + quiet hours"]
  PF --> DL[("notification_deliveries<br/>unique per event×recipient×channel")]
  DL --> ENG["notification engine (dispatch)"]
```

## 7. Notification Flow

```mermaid
stateDiagram-v2
  [*] --> pending : created (or quiet-hours deferred)
  pending --> sent : channel.send ok
  pending --> failed : channel.send failed
  failed --> pending : backoff (base·2^attempt, capped)
  pending --> dead : attempts >= max
  pending --> suppressed : preference/channel off
  sent --> [*]
  dead --> [*] : dead-letter (audited)
```

Channels: in-app (live) · Teams / email (code-complete, credential-gated) ·
WhatsApp / SMS / Push (prepared slots). Driven by `POST /api/jobs/notifications/dispatch`.

## 8. Keka Sync

```mermaid
sequenceDiagram
  participant J as /api/jobs/keka-sync
  participant S as sync.ts
  participant KP as Keka provider (fixture | http)
  participant DB as Postgres
  J->>S: run sync
  S->>DB: open sync_runs record
  S->>KP: fetch users / hierarchy / designations
  KP-->>S: org data
  S->>DB: upsert users, map to Dept Master
  S->>DB: resolve approver chain (approver_email -> user)
  alt failure
    S->>DB: mark sync_runs failed (re-runnable)
  else success
    S->>DB: close sync_runs ok
  end
```

## 9. RBAC Hierarchy

```mermaid
flowchart TB
  REQ["Request (authenticated user)"] --> L1{"Layer 1:<br/>RBAC engine"}
  L1 --> PERM["role_permission rows<br/>12 actions × 21 resources × L0–L3<br/>deny-by-default"]
  PERM -- deny --> D403["403 Forbidden"]
  PERM -- allow --> L2{"Layer 2:<br/>Row-Level Security"}
  L2 --> GUC["app.user_id + app.user_access_level<br/>under essentia_app (non-owner)"]
  GUC --> ROWS["only in-scope rows returned"]
  subgraph Levels["Access levels"]
    direction LR
    L0["L0 external"] --> L1a["L1 staff"] --> L2a["L2 lead / HOD"] --> L3a["L3 founder / admin"]
  end
  subgraph Approval["Approval authority (identity, separate)"]
    A1["Khushpreet"] --> A2["Deepak Ji"] --> A3["Hardesh"]
  end
```

## 10. API Layer

32 route handlers, all behind the middleware gate + RBAC. Grouped by domain
([api-catalogue.md](api-catalogue.md) has the full table).

```mermaid
flowchart LR
  GW["middleware.ts gate"] --> AUTH["auth/identity<br/>login · logout · session · sessions · dev-login · entra · me"]
  GW --> WP["WIO/PIO<br/>wio · wio/:id · wio/:id/convert<br/>pio · pio/:id · pio/:id/request-approval · workflows/:id/act"]
  GW --> PLAT["platform<br/>departments · factory/stations · projects · dashboard/crmtl · audit"]
  GW --> NOTIF["notifications<br/>list · :id read/archive/ack · mark-all-read · preferences"]
  GW --> INTEG["integrations<br/>keka/status · keka/sync"]
  GW --> JOBS["jobs (scheduler-driven)<br/>wio-clock · keka-sync · notifications/dispatch"]
  WP --> SVC["services + workflow engine"]
  NOTIF --> BUS["event bus + notification engine"]
  INTEG --> KEKA["Keka sync"]
```

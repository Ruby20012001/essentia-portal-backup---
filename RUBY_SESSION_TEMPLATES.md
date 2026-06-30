# RUBY'S SESSION PROMPT TEMPLATES
# Copy. Paste. Send. Claude builds.
# Every template below produces production-ready output in one session.
# Fill in the [BRACKETED] parts. Send. Done.

---

## TEMPLATE 01 — BUILD A PORTAL SCREEN

```
Build the [SCREEN NAME] screen for the essentia portal.

Brief reference: Section [N] of the portal brief — [specific clause or rule].

Visual requirements:
- Background: #F4F2F0 (Cream)
- Header: #1C1714 (Espresso) with white logo at 20px height
- Primary metric numbers: Cormorant Garamond, [SIZE]px, #A8895C
- Labels: Lato 300, 13px, #6B6058
- [Any additional visual specs]

This screen must show:
- [Element 1]
- [Element 2]
- [Element 3]

Blocking rules:
- [Action] is blocked until [condition]. Error message: "[exact words]"
- [Action] is blocked until [condition]. Error message: "[exact words]"

Acceptance test: This screen passes when [specific condition — what Akanksha tests].

Generate as a complete, interactive React component. Include all states: 
default, loading, error, empty, and any hover/active states.
```

---

## TEMPLATE 02 — BUILD A NEXT.JS API ROUTE

```
Build the Next.js API route for [FEATURE NAME].

Brief reference: Section [N] — [specific rule this route enforces].

Route: [METHOD] /api/[path]

Input: [describe the request body or query params]

Business logic to enforce:
1. [Rule 1 — e.g. "Check that the WIO checklist is complete before allowing PIO creation"]
2. [Rule 2]
3. [Rule 3]

Database operations (schema in /db/001_essentia_schema.sql):
- Read from: [table(s)]
- Write to: [table(s)]
- Always write to audit.log with action='[ACTION]'

Error responses:
- If [condition]: return 400 with message "[exact message]"
- If [condition]: return 403 with message "[exact message]"

Success response: [describe what the 200 response returns]

Include: TypeScript types, Zod validation on input, error handling, 
and a comment explaining every business rule enforced.
```

---

## TEMPLATE 03 — BUILD AN API INTEGRATION HANDLER

```
Build the [INTEGRATION NAME] integration handler.

Brief reference: Section [N] and the API Integration Spec (Dossier A-05).

What this handler does:
- [Action 1 — e.g. "Reads PID status from TranZact every 5 minutes"]
- [Action 2]

Failure handling:
- Retry: 3 times at 15-minute intervals
- After 3 failures: set portal.api_failure_state.consecutive_failures += 1
- After 3 consecutive failures: send notification to [recipient] via portal.notifications
- Degraded mode: [what the portal shows to users when this integration is down]

The handler must update portal.api_health_log on every check with:
integration name, status ('healthy'/'degraded'/'down'), response_ms, and any error_msg.

Include: TypeScript types, full error handling, the health log write, 
and a JSDoc comment explaining the degraded mode behaviour.
```

---

## TEMPLATE 04 — GENERATE A TEST SUITE

```
Generate the complete test suite for the [FEATURE NAME] module.

Brief reference: Section [N] — these are the acceptance criteria.

Tests to write:
1. [Happy path — describe exactly what should work]
2. [Blocking rule — test that [action] is blocked when [condition]]
3. [Blocking rule — test that the error message reads exactly "[text]"]
4. [Edge case — describe]
5. [Role permission — test that [role] cannot access this when [condition]]

For VisionCAM-related features, add:
- Test that stage completion is blocked without a photo
- Test that the block message reads: "[exact message from brief]"

Use Playwright for UI tests, Jest for API route tests.
Include: setup, teardown, and a comment on each test explaining which brief rule it covers.
```

---

## TEMPLATE 05 — GENERATE THE WEEKLY SPRINT TASKS

```
Generate this week's sprint tasks from the portal brief.

This week we are building: [MODULE OR PHASE — e.g. "Phase 1, Week 3: EE TL Dashboard and WIO module"]

Brief sections to read: [Section numbers]

For each feature in scope, generate a sprint task with:
- Task title
- Brief section reference
- What Claude builds (the specific output)
- What Akshin's team does with it (visual polish)
- What Akanksha tests (the acceptance criterion)
- Estimated session count (how many Claude sessions to build it)

Format as a Notion-ready table. 
At the end: flag any task that needs Monica's decision before it can start.
```

---

## TEMPLATE 06 — WRITE TECHNICAL DOCUMENTATION

```
Write the technical documentation for [FEATURE NAME].

Audience: A developer who joins the project in Month 6 and has never spoken to anyone on the team.
They must be able to understand, run, and modify this feature from this documentation alone.

Include:
1. What this feature does (2-3 sentences, non-technical)
2. Which brief section specifies it
3. Database tables involved (from /db/001_essentia_schema.sql)
4. API routes involved
5. External integrations (if any) and their failure modes
6. Business rules enforced (list each one, with the brief reference)
7. How to test it (the commands to run)
8. Known edge cases and how they're handled

Format as Markdown. Add to /docs/[feature-name].md
```

---

## TEMPLATE 07 — BUILD AN ANTHROPIC API PROMPT

```
Write the Anthropic API prompt for [AI FEATURE NAME].

Brief reference: Section [N] — this is what the AI output must do.

The prompt must produce: [describe the output — e.g. "a 3-line weekly pulse letter personalised to the family"]

Input data available (from the portal's database):
- [Data point 1 — e.g. "Family name and lifestyle notes from public.families"]
- [Data point 2]
- [Data point 3]

Brand voice rules (enforced in every output):
- Never use "studio" — use "essentia" or the vertical name
- Never use "handover" — use "Day of Recognition"  
- Tone: warm, peer-to-peer, never corporate
- Length: [specify]
- Format: [specify]

The prompt must include a system prompt, a user prompt template with 
[VARIABLE] placeholders, and 2 example outputs showing correct tone.

Himgauri will review the example outputs for brand voice before this goes to Eshan to build.
```

---

## QUICK COMMANDS (one-line versions for routine tasks)

**Start a new session:**
"Read CLAUDE.md and the portal brief Section [N]. Build [feature]."

**Fix a screen:**
"The [component] doesn't match the brief. [Describe what's wrong]. Fix it."

**Add a blocking rule:**
"Add a blocking rule to [component]: [action] must be blocked when [condition]. Message: '[text]'"

**Write a test:**
"Write a Playwright test that checks [specific behaviour] in the [component]."

**Generate MOM:**
"Write the Monday meeting MOM from these notes: [paste standup notes]. Format for Notion."

**Audit a screen against the brief:**
"Review this screen against Section [N] of the portal brief. List everything that doesn't match."

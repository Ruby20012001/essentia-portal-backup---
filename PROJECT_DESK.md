# Essentia Project Desk

Every live project in one place, from enquiry to handover, with an assistant
that reads it for you.

It is one page inside the Essentia portal, at **`/project-desk`**. It uses the
portal's own sign-in and the portal's own database. There is no second app.

---

## What it does

- **Stage cards** at the top: how many projects sit at each stage, plus a red
  **Late** card. Tap a card to see only those projects. Tap it again to see all.
- **Ask the assistant**: five one-tap questions, or type your own. The answer
  writes itself out below.
- **Projects**: the list, soonest due date first.
  - Change the **stage** from the dropdown. It saves straight away.
  - Tap the **next step** or the **due date** to change it. It saves when you
    tap away (or press Enter).
  - Projects in **Execution** or **Handover** show a progress bar. Tap
    **Update site work** to tick the 11 site steps. Each tick saves straight away.
  - A project is **late** when its due date has passed and it is not in Handover.
    Its date turns red with a small "late" tag.
  - **Remove** asks once more on the page ("Tap to confirm") before it removes.
- **Add a project**: fill in the form and tap **Add project**.

Everybody's screen updates by itself every 15 seconds. Nobody has to reload.

---

## Start it on this laptop

You need: this folder, Node.js installed, and the file `frontend\.env.local`
(it is already here — it holds the database address).

1. Open **PowerShell**.
2. Go to the portal folder:

   ```
   cd C:\Users\Design1\essentia-portal\frontend
   ```

3. The first time only, install what the portal needs:

   ```
   npm.cmd install
   ```

4. Start it:

   ```
   npm.cmd run dev
   ```

5. Open **http://localhost:3000/project-desk** in a browser and sign in with your
   portal account.

To stop it, go back to PowerShell and press **Ctrl + C**.

---

## Where the data is kept

In the portal's database, in one table called **`desk.projects`**.

Right now `frontend\.env.local` points the portal at the **Neon test
database**. That database is for testing only: it has no backup and nobody
watches it. **Do not put real client details in it yet.** When the portal gets a
proper home, the table goes there with it (see "Putting it online" below).

---

## Things you still need to set up

### 1. The assistant's key (needed for "Ask the assistant")

Without it the page works, but every question answers
"The assistant could not answer just now. Try again."

1. Get an API key from **console.anthropic.com** (Settings → API keys).
2. Open `frontend\.env.local` in Notepad and add one line:

   ```
   ANTHROPIC_API_KEY=paste-your-key-here
   ```

3. Save, then stop and start the portal again (Ctrl + C, then `npm.cmd run dev`).

The key stays on the server. It is never sent to anybody's browser.
Never paste it into a chat, an email or a document.

### 2. Sign-in

Project Desk uses the portal's existing sign-in. Anybody with a portal account
can open it, and every change is stamped with the name of whoever made it.

The portal is not on Microsoft (Entra ID) sign-in yet. **Do not switch it on
just for this page.** Turning it on hides the password form for the HR team,
whose accounts are not in Microsoft yet. That move has to happen for everybody
at once.

---

## Putting it online

The portal itself is not online yet, so neither is this page. When the portal
is put on a server, Project Desk goes with it. Whoever does that needs to:

1. Create the table on that server's database, once:

   ```
   cd C:\Users\Design1\essentia-portal\db
   node --env-file=..\frontend\.env.local apply-project-desk.mjs
   ```

   (with `.env.local` pointing at that database). This only adds the Project
   Desk table. It does not touch anything else, and running it twice is safe.

2. Add `ANTHROPIC_API_KEY` to the server's settings, the same way as above.

The page is already allowed in the portal's "tracker" mode, so no other
setting is needed.

---

## For whoever maintains it

| Piece | File |
|---|---|
| The table | `db/059_project_desk.sql` |
| Add the table to an existing database | `db/apply-project-desk.mjs` |
| The page | `frontend/app/project-desk/page.tsx` |
| The screen | `frontend/components/project-desk/ProjectDesk.tsx` (+ `project-desk.module.css`) |
| Rules: late, site progress %, sorting | `frontend/lib/services/project-desk-logic.ts` |
| Reading and saving | `frontend/lib/services/project-desk.ts` |
| List / add / change / remove | `frontend/app/api/project-desk/projects/…` |
| The assistant | `frontend/app/api/project-desk/ask/route.ts` (Claude Sonnet 5.5, streamed) |
| Tests | `frontend/tests/unit/project-desk-logic.test.ts` |

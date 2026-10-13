# ThyncSpace frontend

The static Next.js frontend for ThyncSpace, a private technical thinking
workspace with document notes, whiteboards, calculations, sharing, real-time
collaboration, Markdown portability, and installable PWA support.

This directory is intended to become the standalone private GitHub repository
`sunaissu/thyncspace-frontend`.

## Requirements

- Node.js 24
- npm
- a running ThyncSpace backend

## Local setup

Install the locked dependencies:

```powershell
npm.cmd ci
```

Create `.env.local` without committing it:

```dotenv
NEXT_PUBLIC_SERVER_URL=http://localhost:5000
```

Start the development server:

```powershell
npm.cmd run dev
```

Open `http://localhost:3000`.

## Checks

```powershell
npm.cmd run lint
npm.cmd run build
```

The production build is a static export in `out/`. Both `.next/` and `out/` are
generated and ignored by Git.

## Production

Cloudflare Pages builds from repository root `/` with:

- production branch: `main`;
- build command: `npm ci && npm run lint && npm run build`;
- output directory: `out`; and
- `NEXT_PUBLIC_SERVER_URL=https://thyncspace-api.bg-labs.com`.

The production custom domain is `https://thyncspace.bg-labs.com`. Keep the API
URL synchronized with `public/_headers` and the backend OAuth callback.

See the backend repository's deployment runbooks for coordinated releases.

## Reviewed package integration

The three editors/calculator packages are pinned to tarballs in `vendor/` so
`npm ci` installs the reviewed code without an unpublished registry version.
Sources: calculator `f4488ef`, document-editor `d4d6dc1`, Noteboard `03593d5`.
Keep these artifacts checked in until a coordinated npm release replaces them.
The host uses DocumentEditor and each Yjs binding's local undo history directly.

## Organization and recovery

Use **Organize and recover** to assign a notebook and comma-separated tags to
an owned note. Notebook filtering and text/tag search work in the note list.
The same panel lists trash and the last five previously saved versions.
Restoration creates a private note with a new ID; existing notes and live edits
are not overwritten. Restoring trash consumes its old entry. Share restored
notes again when needed. The matching backend update is required.

The calculator remains private to the current user. See the collaboration section below.

## Regression checks

Run `npm run check`, `npm test`, `npm run lint`, and `npm run build`.
For browser checks, start `npm run dev -- --hostname 127.0.0.1 --port 3010`, then
run `npm run test:browser`. Override `REVIEW_URL` or `CHROME_PATH` when needed.
The browser suite uses controlled API fixtures; it does not authenticate against
or mutate a real account. See REVIEW-2026-10-12.md for scope and remaining gaps.

## Save conflicts and offline recovery

Private content saves send the last confirmed contentRevision. A stale save opens
comparison controls; download both copies before restoring or keeping the server
copy. Each editing session has its own account-scoped browser draft. Failed browser
writes keep an in-memory copy during navigation and show a download option.

Live edits persist CRDT state in IndexedDB. Reopening an accessible editable note
merges retained changes and the server rechecks permissions on replay. This is draft
recovery, not an offline note library. Reconnect keeps the editor mounted and pauses
editing. Synced means received by the live service; Saved requires a database receipt
matching current content. Preserve/download the draft if browser storage fails.

Name and compare retained versions in Organize and recover. Names do not pin a
version: only the last five are retained. Permanent deletion applies only to trash,
requires confirmation, and removes that note and its retained history.

The tooling uses Tailwind 4 and direct TypeScript/React/accessibility lint plugins.
Run npm run test:recovery for two-tab API-fixture checks. Run npm run test:live with
both sibling repositories installed and the backend built for real local MongoDB/
WebSocket/browser recovery checks. All browser scripts accept REVIEW_URL and
CHROME_PATH; recovery/live checks default to port 3011. They use disposable data.

## Private calculator and live cursors

The calculator is a personal tool. Its expression, variables, history, and results stay in component state and are not sent through note APIs, Yjs, or awareness. It has no insert/recalculate-note controls. Existing calculation text in a note remains ordinary note content.

Shared documents and boards show named pointer cursors and a participant list. Each browser tab has its own Yjs session ID; cursor labels include that ID so two tabs for the same account remain distinguishable. The server supplies the authenticated account name and assigns distinct active-session colors. Presence is ephemeral and excluded from saved note content. Nearby cursor labels are offset. Document pointers are anchored to visible blocks in the same editor mode; the participant list remains visible when users choose different modes. These are pointer indicators, not collaborative text-selection highlights.

Each person pans and zooms a board independently. Cursor positions use board coordinates and are projected through the viewer's local viewport. The noteboard `getViewport()` API avoids serializing elements during pointer movement.

Run `npm run test:presence` against the local review frontend to check two authenticated accounts, separate tabs, disconnect cleanup, document/board pointers, private calculations, and local navigation using the sibling backend with disposable MongoDB. Authentication-page responses are fixtures; collaboration tokens, permissions, WebSockets, and storage use the real backend.

## Workspace tools

Notebook paths such as Research/Physics create nested groups. Organize and recover
can move up to 100 owned notes together and rename or merge tags across active
owned notes. These actions change organization only, preserving current content.
Mark a document or board as a reusable template to offer it in New note; creation
copies its content into a new private note without sharing or template status.

Advanced search combines owner, type, exact tag, updated-date boundaries (UTC),
notebook and text. It shows matching content snippets. Save up to 20 named views.
Pins (up to 100), the last 40 opened notes, and saved views belong to the signed-in
account and are stored on the backend. Pinned notes sort first; Recently opened
uses visit order and has an explicit clear action. Access checks still apply.

Tasks gathers Markdown checkboxes outside fenced code, with completion/overdue
filters and source-note links. Use due:YYYY-MM-DD or the calendar emoji followed
by an ISO date. Open the source note to change a task; the overview does not edit
notes implicitly. The list is capped at 5,000 tasks, paged 50 at a time.

Split view keeps two different notes mounted with independent editing, undo and
save state. Narrow screens stack the panes. Commands (Ctrl/Cmd+Shift+P) finds notes
and opens creation, import and recovery actions with keyboard navigation.

Settings provides editor mode, font size, reading/full width and new-note type.
These preferences are scoped to the account in this browser. Account storage
reports content, history and collaboration bytes and links to notes and trash
for deliberate cleanup; it excludes database overhead and indexes.

Version comparisons render document previews and a changed text range, or board
previews with added/removed/changed object counts. Original source remains available.
Only five prior versions are retained, including named versions.

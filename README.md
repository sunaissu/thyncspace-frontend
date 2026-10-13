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

## Linked notes and vault review

Type [[ in visual or Markdown mode to find accessible notes. Use arrows and Enter,
or choose a suggestion. New links use a stable note ID and a readable label.
Connections lists outgoing links, backlinks and a local graph with navigation.
Imported title/path links resolve relative to sourcePath; duplicate titles are
shown as ambiguous rather than choosing a note silently. Code samples and comments
do not create graph edges. The graph displays up to 24 neighbors, with separate
link lists; extraction is bounded to 2,000 references per note.

Markdown/vault selection now opens a preview before import. It lists duplicate
titles, unresolved or ambiguous wiki links, and missing local assets. Selected
assets are also flagged because this Markdown bridge does not upload them.
Import explicitly creates private copies; cancel makes no API write. The report
is capped at 500 issues. Folder selection reads Markdown content and other file
names only. Closing the modal invalidates pending reads.

Run npm run test:links for visual/source completion, stable references, backlinks,
graph layouts and preview-before-import checks using API fixtures.

## Archive

Organize and recover can archive one note or a selected group. Archived notes leave the active list and remain searchable through the Archived filter and Commands. Unarchive restores them to the active list. This is private organization: it does not remove sharing, change content, or move notes to trash. Saved views can retain the Archived filter.

## Signed-in devices

Settings lists up to 100 active sessions, identifies the current one, and shows approximate browser/device names and first/last request times. Signing out a selected session closes its live editors and blocks future API requests and token reuse. Signing out this session returns to login. Devices appear after their first authenticated request following this update.

## Daily and recurring notes

Daily notes opens one private note per selected date. The date defaults to today in
the browser's local time zone. Choose an owned template, or a blank document; the
first creation wins and subsequent requests reopen it. A trashed daily note must be
restored before reopening, and restoration keeps the date linked to the new note ID.

Recurring notes requires an owned template and a daily/weekly time in UTC. Each
account may keep 20 schedules. Pause, resume, remove, refresh and open the latest
generated note from the same dialog. Removing a schedule preserves created notes.
The backend runs it while browsers are closed. After downtime it creates one missed
occurrence and advances to the next future time, instead of flooding the library.
Unavailable/invalid templates pause their schedules with an explanation.

On mobile, Workspace tools in the active note header opens daily notes, connections,
tasks, organization, import, creation and note actions without a permanent extra
toolbar. Run npm run test:schedules for the daily/recurring and mobile access flow.

## Quick capture

Open Capture from the workspace to review text before saving a private document in Inbox. The installed PWA declares a text/URL share target for browsers that support it; receiving and reviewing a share also works at /capture/?title=...&text=...&url=.... The GET share target initially places content in the request URL; the page removes query parameters from the current history entry after reading them. Do not use URL sharing for secrets. No supplied URL is fetched.

Sign-in can happen in another tab without discarding the capture. Save is explicit, failures preserve the text, and retries use the same ID to avoid duplicate notes. Organize and recover files saved notes into notebooks. Unsaved capture text lasts only in the current page; it is not a durable offline draft. Browser/OS share-sheet support varies: see [MDN share_target](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target).

Requests carry the account displayed in this tab. If another tab changes the session account, the API rejects the mismatch instead of saving under that other account. Refresh sign-in in Capture to choose the current identity explicitly. The account marker supplements existing authentication and CSRF checks.

## Account privacy

Settings links to Account privacy. Download my data retrieves a JSON Lines account export and verifies its completion marker before creating a download. Save pending note edits first; this is a read-time data export, not an atomic backup or a workspace import file. It includes owned documents/boards and retained history, profile and server-held preferences, with private credentials and other owners' content excluded. Browser-only drafts and calculator state are not sent to the server.

Account deletion requires typing the current username and submitting a request. The page shows the request ID and pending date after reload, and allows cancellation while pending. A service operator must fulfil it using the backend maintenance procedure; submission does not immediately erase data or promise a processing deadline. Run npm run test:privacy for export completion and request/cancellation checks in Chrome.

## Account security and recovery

Forgot your password on the sign-in page opens email recovery. Settings links to Account security for email status, requesting a verification link, and changing a local password after entering the current password. Google accounts can verify their stored email through the same explicit link, while their password remains managed by Google. Email-based sharing requires verification; an owner can instead use a teammate's confirmed username. Existing grants remain intact.

Recovery/verification links carry their token in the URL fragment. The receiving page removes it from current history, waits for confirmation, checks repeated passwords, and handles another link opened in the same tab without applying a stale response. Reset/change signs out existing sessions and live editors; sign in again afterwards. Missing SMTP configuration is shown explicitly. Run npm run test:security for the receiving and settings flows. Real mailbox delivery is deployment-dependent and was not exercised by browser fixtures.

## Note activity

Select an owned note and open Activity from the workspace bar or mobile Workspace tools. The dialog shows saved edits, sharing/permission changes, organization, trash and restore events, with refresh and keyboard dismissal. Up to 100 recent events are retained from rollout onwards. Live saves can combine multiple contributors and are labelled Live collaboration; named actors use current profile names. The timeline is owner-only. Run npm run test:activity for desktop/mobile controls and layout.

## Private study tools

Open Commands > Study tools, or use Study tools in the mobile workspace menu. Choose a document and load/paste a matching excerpt, up to 20,000 characters. Draft generation recognizes consecutive Q:/A: lines, Term: definition lines, and Markdown headings followed by paragraphs. It ignores fenced examples, quotes source answers and produces up to 20 drafts. Review/edit each question and answer, or write a card manually, before saving.

Cards live in account-scoped IndexedDB on this browser, with a 200-card cap. Flashcard practice reveals answers; question practice also provides a place to write your own answer before revealing. Self-ratings and review counts persist. Source links open currently accessible notes, and changed/unavailable sources are indicated. Saved cards are private copies: revoking source access cannot recall an existing copy.

Concurrent tabs use revision checks so stale changes/deletes are rejected. Reload the deck or preserve edits as a new draft after a conflict. Storage failures keep the editor open with an error and a JSON download option. Download cards and drafts exports their text and source excerpts; clearing browser storage removes local cards. Server account exports cannot include them. Run npm run test:study for generation, editing, persistence, practice, export, source navigation and mobile layout.

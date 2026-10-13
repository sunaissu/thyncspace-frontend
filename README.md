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
recovery; the opt-in offline library below handles cached browsing and private-note queues. Reconnect keeps the live editor mounted and pauses
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

## Attachment library

Open Commands > Attachments, or use the mobile workspace menu. Upload a static PNG/JPEG/WebP, PDF, or UTF-8 text file up to 2 MiB; the library shows your 100-file / 50 MiB storage allowance. Uploads start private. Link an owned file to an editable note after confirming that current and future note collaborators may download it. My files and selected-note files support search, previews, downloads, note navigation, unlinking and confirmed deletion. Access checks run again when fetching content.

Text renders as escaped text (preview capped at 50,000 characters). Images are normalized on the server. PDF previews use [PDF.js](https://mozilla.github.io/pdf.js/examples/) canvas rendering, with page controls and bounded canvas/image sizes; document scripting, forms and annotation actions are not enabled. Protected or unsupported PDFs show an error with a download option. Canvas previews are visual only; download for selectable text and accessibility tools. The predev/prebuild script copies a versioned worker from the installed package into public; the worker is served locally and is not checked into Git. No external PDF service receives the file.

Owner account downloads include attachment bytes and references. Deleting an account removes its files; deleting a note permanently removes its references without deleting the files themselves. Run npm run test:attachments for upload, escaped text, download, linking/unlinking, search, actual PDF rendering and 320–1440px layouts.

### Selected-image OCR

For an owned image, open its preview > Image text and search. Opt in for that image, run English recognition, review/edit the result, and choose Save reviewed text to search. Recognition alone does not write an index. Saved text follows the file's access rules; unlinking/revoking note access also removes search access. Remove search text deletes only the index. Stale-tab writes are rejected; reload saved text to resolve the conflict. Unsaved edits prompt before switching files, changing filters or closing the library.

[Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md) and its English model are served from /ocr, generated by predev/prebuild. No OCR provider receives the image. One recognition job runs per page, with cancellation and a 90-second timeout. If cancelled during engine initialization, the initializer is allowed to settle and its worker is then terminated before another job starts. The worker response policy allows WebAssembly only for that worker's assets; the page policy is unchanged. Saved text is capped at 50,000 characters and uses a separate index revision. OCR quality varies; review names and numbers against the image. Run npm run test:ocr for real recognition under the worker CSP, opt-in, review/save, search, reload and removal.

## Private reminders

Open Commands > Reminders or the mobile workspace menu. Choose a note or an open Markdown task, set a local date/time, and choose a one-time reminder or 1/7/30/90-day review interval. A selected task's due date pre-fills 09:00 local time. Marking a reminder done does not edit its source checkbox; repeated reviews advance past missed intervals after you mark them reviewed. Snooze sets a reminder 24 hours ahead. Up to 100 private reminders are stored per account, with revision checks for concurrent tabs.

A moved/changed task, completed task or unavailable source suppresses notifications. Open the source and replace a changed-task reminder when needed. The list shows these states explicitly. Reminders are included in account downloads/deletion and are never shared through the note.

Browser notifications require an explicit opt-in and permission. The workspace checks about once a minute while open and online; this is not a push service for closed or sleeping browsers. Alerts contain a count, without source titles or task text. Supported browsers use Web Locks and account-scoped storage to avoid duplicates across tabs. Unavailable browser storage/permissions produce an error. Notification clicks focus the existing workspace without reloading pending edits, or open a new workspace when necessary. Run npm run test:reminders for schedule/review/snooze/source-change/mobile controls and notification opt-in/deduplication; OS notification UI is mocked in that test.

## Opt-in offline library

Save pending online edits, select a note, and choose Commands > Make selected note available offline (also in mobile Workspace tools). The consent prompt explains that the saved copy remains accessible after sign-out to people using this browser profile. Open /offline-library/ once while online to prepare its shell and editor assets. The production service worker caches that public static page and fingerprinted assets; authenticated API responses remain network-only. The offline fallback links to this library.

The library keeps account-scoped document/board snapshots in IndexedDB, capped at 100 notes and 20 MiB per account including queued content. Each content value remains limited to 1 MiB. Private owned notes can be edited offline; Queue changes on this device confirms durable storage. Unqueued edits warn before leaving and can be downloaded. Shared copies are read-only here. Attachments from the separate attachment library are not cached; inline board image data remains part of board content. Existing live CRDT draft recovery continues separately.

Synchronize queue explicitly rechecks the current signed-in account, each note's current access/private status, and its server revision. Every read/write pins the expected account in its header. Changed revisions retain the queue for comparison. Compare with server shows both values; choose the server copy or explicitly apply the offline version with another revision check. A lost save response is recognized by matching server content on retry. A note that becomes shared, disappears or loses access stays queued for recovery/download. Newer local edits in another tab are never discarded by stale writes/deletes.

Downloads include the selected current edit or all cached/queued records for the chosen account. Removing a local copy requires confirmation. Damaged records remain available through raw recovery download before an explicit whole-library reset. Offline copies are separate from server account exports and remain until you remove them or clear browser storage. This page can read retained device copies without treating them as a server-authenticated session; online synchronization still requires authentication.

Run npm run build, then npm run test:offline. The test serves the production export on a disposable loopback port and exercises actual service-worker navigation with the browser disconnected, document/board queue persistence, wrong-account rejection, revision review, lost-response retries, sharing changes, shared read-only copies and mobile widths. IndexedDB unit tests cover cross-tab races, byte/count limits, failed storage and damaged-record recovery.

## Linked sources

Select a document or board and choose Commands > Linked sources (or mobile Workspace tools). Link an accessible document/board, then preview it beneath the main editor. The panel stays collapsed when not in use, preserves the editor's width, and scrolls within its own area. Only one source preview is rendered at a time; document previews are sanitized Markdown and board previews are read-only. Open source navigates to the original. This reference metadata does not insert copied text into the host document.

Each viewer needs current access to both host and source. Linking a private source does not share it with the host's collaborators. Expanded lists and previews recheck access every 30 seconds and on Refresh; unavailable sources lose their rendered content. Source changed since last reviewed compares content revisions, while the preview shows current content. Mark this revision reviewed acknowledges only the previewed revision and rejects a newer concurrent source edit. Lists and writes also carry their own revision to avoid stale metadata updates. Sources are not recursively expanded.

Note recovery preserves the host's current references, with source permissions checked again. A restored source gets a new private identity, so old references need explicit relinking. References travel in server account data; Markdown-only exports and offline cached content do not carry embedded previews. Run npm run test:embeds for document and board hosts, current previews, stale/review state, revocation cleanup and 320–1440px layouts.

### Discussions and mentions

Open Commands → Discussions and mentions, or use the mobile tools menu. Choose a note or the inbox across notes, then filter unresolved discussions, mentions, replies, or all threads. Editors can post, reply, edit/delete their own comments, and resolve/reopen discussions. The note owner can permanently remove a whole thread. Viewers can read. Names come from current accounts; mentions appear in the recipient's inbox without sending email.

The dialog refreshes every 30 seconds and has an explicit refresh control. Failed writes retain drafts. Comment edits keep the revision loaded when editing began so another tab's edit cannot be silently replaced. Navigation warns before discarding a draft. If access disappears, the draft remains available to copy. Limits are 100 threads per note, 50 comments per thread, 4,000 characters per comment, and 10 mentions. Run npm run test:discussions for the browser regression.

### Shared notebooks

Open Commands → Shared notebooks, or use the mobile tools menu. Owners can create/rename a notebook, add saved private documents or boards, and manage viewer/editor membership. A note inherits the notebook's membership until detached. Per-note sharing controls explain this and remain disabled for attached notes. Your private folder labels and calculator contents remain private.

Wait for open notes to show Saved before changing access. Membership changes apply to all contained notes and require confirmation. Detaching makes a note private; deleting a notebook keeps its notes and makes them private. Trashed notes recover privately. Changes use revision checks; Refresh notebooks loads the current state after a conflict. Live role changes update editor controls and note access labels. Switching between private and live modes loads the latest committed content and revision rather than seeding a private editor from stale metadata.

Limits: 20 owned notebooks, 100 notes and 100 members per notebook, with 50 notebooks per list page. Run npm run test:notebooks for UI behavior and responsive layouts, and npm run test:presence for real two-person collaboration with inherited roles.

### Selected-passage AI

Open Commands > Passage AI actions, or use the mobile tools menu. Choose a saved document, select a passage, and review the send preview. Summarize passage and Extract stated variables each require consent for that request. Changing the selection, source or action clears consent. Save pending edits first; stale saved revisions require reloading and selecting again. Availability depends on backend configuration and is off by default.

Generated output is plain text with source quotes, revision and an exact passage. Review it before use. Download preserves the result as JSON; Save a private copy creates an independent Inbox document with a source link. Generated content is stored as literal code text so it cannot activate image requests or links. No action writes into a shared document or calculator. Closing or leaving warns about unsaved output. Run npm run test:ai for the mocked-provider browser regression; real provider credentials and billing were not exercised.

### Portable workspace archives

Open Commands > Workspace archive, or use the mobile tools menu. Download saves owned documents, boards, archived notes, Trash, folder labels, tags, linked sources and attachment data after checking the completion checksum. It reads saved server data; wait for open editors to show Saved. Account privacy remains the broader export for account settings, history and discussions. Calculator and other browser-only data are not sent.

Choose a .jsonl archive to inspect its records before confirming Restore private copies. Uploads are resumable for six hours; reselect the same file and resume after an interruption. Refresh import progress recovers a lost commit receipt without creating duplicate notes. A completed receipt blocks accidental repeat imports until explicitly dismissed. Cancel staged import removes uploaded staging, and keeps existing notes. Restores create private copies and reconnect internal note links. Original Trash entries remain in Trash. Sources outside the archive still need their existing access permissions. Ambiguous title links require manual review.

The dialog shows the 1,000-note, 100-file, 175 MiB encoded-record and 50 MiB attachment limits. Account file quotas also apply; identical owned files reuse storage and keep existing metadata. The import commits all visible copies together, so validation or quota failures leave the original workspace intact. Run npm run test:archive for checked downloads, preview/consent, account pinning, interrupted upload/commit recovery and 320/390/1440px layouts. Parser unit tests cover fragmented UTF-8, truncation, altered checksums and duplicate records.


### Obsidian companion

Open Commands > Obsidian companion, or use the mobile workspace tools, to create a named connection and download the desktop plugin. Select private documents, confirm optional linked-file access, and copy the token once. Connections expire after 30 days and can be revoked independently. The companion reviews both changed copies, preserves missing/local files, and supports optional five-minute sync after an initial review. Calculator state and shared notes are outside its scope. See [installation, conflict handling and limits](integrations/obsidian/README.md).


### Protected authentication forms

Sign-in, registration and recovery load the backend authentication policy before enabling local submission. Closed registration has an explicit message and leaves existing-account sign-in available. Optional Turnstile challenges load only when configured, carry the correct action, and reset after each request or expiry. Failed policy/widget loading has a retry action. Forms now associate every visible label with its input and fit 320px screens. Run npm run test:auth-policy for the mocked-widget regression and npm run test:security for account recovery.

When verified-email access is enabled on the backend, unverified accounts see a verification prompt before the online workspace. Account security and account privacy remain reachable. Check verification again refreshes the authenticated profile after completing the email link.


### Technical starters and service information

New note includes eight previewable Markdown structures: engineering design log, lab notebook entry, worked problem, architecture decision record, debugging investigation, lecture/review notes, experiment record, and project calculation sheet. Use a starter creates an independent private document through the normal note API. The calculation sheet does not import calculator state. Your saved document/board templates remain in their own section. The dialog scrolls internally and keeps its close control available.

/service/ is public and remains usable if session verification fails. It shows the latest API/database connection status, a configured incident notice, support/abuse and policy links, data controls and an operator-supplied retention statement. It marks status-check failures and retains the last timestamp. It does not infer provider health or invent missing policies. Links are HTTPS only, notices are plain text, and the page sends no credentials for its status request. Run npm run test:foundation for service failure handling, hostile text/links, private starter creation and mobile layout.

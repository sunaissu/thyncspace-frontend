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
Sources: calculator `f4488ef`, document-editor `425df08`, Noteboard `2ed1f7d`.
Keep these artifacts checked in until a coordinated npm release replaces them.
The host uses DocumentEditor and each Yjs binding's local undo history directly.

## Organization and recovery

Use **Organize and recover** to assign a notebook and comma-separated tags to
an owned note. Notebook filtering and text/tag search work in the note list.
The same panel lists trash and the last five previously saved versions.
Restoration creates a private note with a new ID; existing notes and live edits
are not overwritten. Restoring trash consumes its old entry. Share restored
notes again when needed. The matching backend update is required.

Calculator insertion into a document now keeps a versioned Markdown block with
the expression, numeric variables, angle mode, formatting, and numerical-operation
settings. Open **Calculator** to edit the expression/variables and recalculate a
saved block. At most 20 blocks are shown per note; remaining blocks stay in the
Markdown. These blocks travel with Markdown export/import. Canvas calculator
insertion remains a text result; cross-note references, units, and dependency
graphs are future work.

## Regression checks

Run `npm run check`, `npm test`, `npm run lint`, and `npm run build`.
For browser checks, start `npm run dev -- --hostname 127.0.0.1 --port 3010`, then
run `npm run test:browser`. Override `REVIEW_URL` or `CHROME_PATH` when needed.
The browser suite uses controlled API fixtures; it does not authenticate against
or mutate a real account. See REVIEW-2026-10-12.md for scope and remaining gaps.

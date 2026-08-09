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

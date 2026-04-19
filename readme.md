# Docsyra

Docsyra is a collaborative document workspace with a Notion-like editor, threaded comments, live presence, notifications, document sharing, and Cloudflare-based hosting.

## What It Does

Docsyra lets teams create and edit documents together in real time while keeping comments, notifications, sharing, and document history in sync.

## Features

- Rich text editor built with TipTap and ProseMirror.
- Real-time collaboration with Yjs awareness for live cursors, selections, and typing indicators.
- Threaded comments with range anchors, replies, resolve/reopen flow, and fallback rehydration when content changes.
- In-app notifications for comments and mentions, plus email delivery.
- User authentication with email/password, OAuth, passkeys, OTP, 2FA, password reset, and email verification.
- Document sharing with visibility controls, collaborator invites, and role-based access checks.
- Version/history support, restore flows, and document activity logging.
- GitHub synchronization tools for connecting, previewing, and pulling remote content.
- Dashboard shell with notifications, account controls, and document navigation.

## Workspace Layout

- `docsyra_app/` - Main Next.js application.
- `docsyra-collab/` - Separate Cloudflare Worker and Durable Object service for Yjs collaboration.

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- TipTap
- Yjs
- Cloudflare Pages
- Cloudflare Workers
- Cloudflare Durable Objects
- Cloudflare D1
- Cloudflare R2

## Local Development

### Prerequisites

- Node.js 20 or newer
- npm
- Wrangler CLI for Cloudflare deploy and preview commands

### Install Dependencies

Run this in each project folder that you want to work on:

```bash
cd docsyra_app
npm install
```

```bash
cd ../docsyra-collab
npm install
```

### Run the Main App

From `docsyra_app/`:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### Build the Main App

From `docsyra_app/`:

```bash
npm run build
```

### Preview the Cloudflare Pages Output

From `docsyra_app/`:

```bash
npm run preview
```

This builds the app for the Pages runtime and starts a local Wrangler Pages preview.

## Hosting And Deployment

Docsyra is designed to be deployed in two parts:

### 1. Main Application

The main app is deployed as a Cloudflare Pages-compatible Next.js build.

From `docsyra_app/`:

```bash
npm run pages:build
npm run deploy
```

If you are deploying through Cloudflare Pages, the build output is configured for `next-on-pages`.

### 2. Collaboration Worker

The collaboration service runs separately as a Cloudflare Worker with a Durable Object.

From `docsyra-collab/`:

```bash
npm run deploy
```

### Production Requirements

You will need these Cloudflare resources configured for a full deployment:

- A D1 database for application data.
- An R2 bucket for document assets.
- A Durable Object namespace for collaboration rooms.
- Pages or Worker deployment for the main app.
- Worker deployment for the collaboration service.

## Environment Variables

The main app uses Cloudflare bindings and runtime variables defined in `wrangler.jsonc`.

### Main App Variables

- `ENV_NAME` - Current environment name.
- `NEXT_PUBLIC_APP_URL` - Public app URL.
- `NEXT_PUBLIC_R2_BASE_URL` - Base URL for asset delivery.
- `NEXT_PUBLIC_COLLAB_WS_BASE_URL` - WebSocket base URL for collaboration.
- `GOOGLE_CLIENT_ID` - OAuth client ID for Google sign-in.
- `GITHUB_CLIENT_ID` - OAuth client ID for GitHub sign-in.
- `PASSKEY_RP_ID` - WebAuthn relying party ID.
- `PASSKEY_ORIGIN` - Allowed WebAuthn origin.
- `PASSKEY_RP_NAME` - Display name shown in authenticator prompts.
- `BASE_URL` - Main app base URL.
- `DB` - D1 database binding.
- `R2` - R2 bucket binding.

### Security Secrets

These are required for auth and encryption flows and should stay server-side:

- `TWO_FACTOR_SECRET_KEY` - Encrypts TOTP secrets at rest.
- Any provider secrets required by OAuth, email delivery, or deployment tooling.

## Collaboration Service

The collaboration worker in `docsyra-collab/` hosts Yjs document rooms behind a Durable Object.

### How It Works

- The client opens a websocket connection for a document room.
- The worker uses a Durable Object instance per document ID.
- Yjs state updates are broadcast to connected clients.
- Awareness data is used for presence features such as live cursors and typing indicators.

## Database And Migrations

The application stores documents, comments, notifications, invitations, sessions, and user metadata in D1.

Run the migration files in `docsyra_app/migrations/` against your database before deploying.

## Common Commands

### Main App

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run pages:build
npm run preview
npm run deploy
npm run cf-typegen
```

### Collaboration Worker

```bash
npm run deploy
```

## Deployment Notes

- Make sure the main app and the collaboration worker point at the correct production URLs.
- Update `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_COLLAB_WS_BASE_URL` for the environment you deploy.
- Keep D1 and R2 bindings aligned between local, preview, and production environments.
- If passkeys are enabled, `PASSKEY_RP_ID` and `PASSKEY_ORIGIN` must match the deployed domain.

## Repository Structure

- `docsyra_app/` - Application UI, API routes, database queries, editor components, auth, notifications, and server code.
- `docsyra-collab/` - WebSocket collaboration worker and Durable Object room logic.
- `structure.txt` - Folder tree snapshot for the workspace.

## Notes

- The main app build is validated with `npm run build`.
- The collaboration service has no separate build step beyond Wrangler deployment.

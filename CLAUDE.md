# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

MinuteMind AI is a React + Vite single-page app for logging, organizing, and analyzing manufacturing operational review meetings (categories: SOR, POR, MOR; companies: Company Wide, Corrugated, Paper & Board). Gemini AI powers meeting-minutes analysis, a "Corporate Memory" chat over all past meetings, smart briefings, and stakeholder email summaries. The project originated as a Google AI Studio app (see `README.md`'s ai.studio link and `metadata.json`'s `majorCapabilities`).

## Commands

- `npm install` — install dependencies.
- `npm run dev` — Vite dev server on port 3000; proxies `/api/*` to `http://localhost:4001`.
- `npm run start:backend` — runs `backend/server.js` directly with `node` (plain ESM JS, no build step). Must be running alongside `npm run dev` for AI features to work locally.
- `npm run build` — `vite build` → `dist/`.
- `npm run start` — build then run `start:backend`; the backend serves both the API and the built `dist/` SPA from one port (4001 by default).
- `npm run preview` — Vite's static preview of `dist/` only; there's no `/api` backend behind it, so AI features won't work unless the backend is also running separately.
- `npm run lint` — `tsc --noEmit` (type-check only). There is no ESLint config and no test runner/framework in this repo — don't assume a test command exists.

Local dev requires `backend/.env` (copy from `backend/.env.example`) with a real `GEMINI_API_KEY`; `backend/server.js` loads it via `dotenv` from an absolute path, not `.env` in the frontend root.

## Architecture

### Two production topologies

This repo supports two different ways of running in production, both driven by the same `backend/server.js`:

1. **Standalone single-port** (`run.bat`): runs `npm run start`, so one Node process (default port 4001) serves both `/api/*` and the built SPA. `run.bat` uses the bundled `node.exe` in the repo root if present, otherwise falls back to system `node`.
2. **Two-process PM2 + IIS** (`ecosystem.config.cjs`): `minutemind-backend` (`backend/server.js`, port 6005, API only) and `minutemind-frontend` (`frontend-server.js`, port 6006, serves `dist/` and proxies `/api/*` to the backend) run as separate PM2 apps. `web.config` configures IIS Application Request Routing to split traffic between the two ports — used when this app must coexist with other apps on the same Windows box.

`backend/server.js` and `frontend-server.js` each independently define an identical CSP + security-header block. If you add a new external asset domain (CDN, font, API), update the CSP in **both** files or the two topologies will diverge.

### AI integration is fully proxied

The frontend never calls Gemini directly. `src/services/gemini.ts` POSTs to `/api/gemini/<endpoint>`; the actual `@google/genai` calls happen server-side in `backend/routes/gemini.js`, keeping `GEMINI_API_KEY` out of the client bundle. To add a new AI feature, add a route handler in `backend/routes/gemini.js` and a matching wrapper in `src/services/gemini.ts`.

Endpoints mix model versions by convention: extraction/search endpoints (`describe-meeting`, `extract-meeting-name`, `find-relevant-meetings`, `analyze-meeting-minutes`, `ask-about-meetings`) use `gemini-2.5-flash`; HTML-generating endpoints (`generate-smart-briefing`, `ask-corporate-memory`, `generate-email-summary`) use `gemini-3.5-flash`. Match the existing pattern for an endpoint's category unless told to change it.

### Auth is Microsoft-only (Firebase Auth), data is still localStorage

Sign-in is gated via Firebase Auth's generic OAuth provider for `microsoft.com` (`src/lib/firebase.ts` — `microsoftProvider`, restricted to the `packages.com.pk` Azure AD tenant via `setCustomParameters({ tenant })`, plus a client-side `ALLOWED_EMAIL_DOMAIN` check as defense-in-depth). `App.tsx` subscribes to `onAuthStateChanged` and renders `src/components/Login.tsx` until a user is signed in. This requires the Microsoft provider to be enabled in the Firebase Console with a matching single-tenant Azure AD app registration — auth silently can't succeed without that console-side setup (no amount of code changes fixes a missing/misconfigured Azure app registration).

Meeting data itself is still stored client-side in `localStorage` (key `minutemind_meetings_v2`) — see the persistence effect in `src/App.tsx` — and is **not** scoped per signed-in user or written to Firestore. Firestore artifacts exist in the repo (`firestore.rules`, `firebase-blueprint.json`, `firebase-applet-config.json`) but remain inactive/staged; treat them as not the live data layer unless explicitly migrating persistence.

`src/types.ts` (`Meeting`, `Attendee`, `ActionItem`, `Attachment`, `PowerPointSlide`) is the single source of truth for the data shape. `firestore.rules`' `isValidMeeting()` and `firebase-blueprint.json`'s `Meeting` entity are a parallel, only loosely-synced schema for the dormant Firestore version — update all three together if you change the shape and are keeping Firestore support current.

### Frontend structure

`src/App.tsx` is one ~3700-line component holding essentially the whole app: dashboard, search/filter, meeting detail drawer (create/edit), AI analysis trigger, smart briefing, "frictionless publish" (email/slack/print), Corporate Memory chat, the attachment/file-upload system, and KPI calculations. There's no router — navigation is tab state (`activeTab`) plus modal/drawer booleans. The file is internally organized into numbered `// === N. SECTION NAME ===` comment blocks; use those to navigate rather than assuming component boundaries. `src/components/StatCharts.tsx` is the only other real UI component (Metrics and Accountability dashboards).

Chart.js is **not** an npm dependency — it's loaded via a `<script>` CDN tag in `index.html` and accessed at runtime as `(window as any).Chart` inside `StatCharts.tsx`. Chart instances are manually created/destroyed in a `useEffect` keyed on the meetings data and active sub-tab.

Styling is Tailwind CSS v4 via `@tailwindcss/vite` — there's no `tailwind.config.js` (v4 is CSS-first; `src/index.css` is just `@import "tailwindcss";`). Use the `cn()` helper (`src/lib/utils.ts`, clsx + tailwind-merge) for conditional/merged class names. Icons are from `lucide-react`; animations use the `motion` package (Framer Motion's successor); AI markdown responses render via `react-markdown` + `remark-gfm`.

The `@/*` path alias maps to the project root (see `tsconfig.json` and `vite.config.ts`).

### Two unrelated env-var mechanisms

Root `.env.local` / `.env.example` (`GEMINI_API_KEY`, `APP_URL`) are for the Google AI Studio hosting environment, which auto-injects secrets at that layer. `backend/.env` (copied from `backend/.env.example`) is what `backend/server.js` actually reads via `dotenv` for local dev and every production topology above. Setting the root `.env.local` has no effect on local dev or self-hosted production — only `backend/.env` matters there.

### Repo hygiene note

`node_modules/`, the built `dist/`, and the bundled `node.exe` (~95MB) are all committed to git, despite being the kind of thing normally gitignored — `.gitignore` only excludes `build/`, `coverage/`, `*.log`, and `.env*` (except `.env.example`). Check `git status` before any broad `git add`, since reinstalling dependencies or rebuilding `dist/` will surface as large diffs.

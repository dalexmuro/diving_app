# Journal de plongée / Diario de buceo — Personal Dive Log & Telemetry Platform

> **Full-Stack Dive Platform built with GenAI-assisted engineering** — Automated security & PII gates, Cloudflare edge infrastructure (Workers + D1 + R2 + Static Assets), and an offline-first, bilingual **Web PWA** installable on desktop and Android.

**Journal de plongée / Diario de buceo** is a personal scuba diving logbook and telemetry analytics platform tailored for the **Suunto Nautic** dive computer and **FFESSM** logbook standards. It parses binary `.fit` files (and supports Suunto Cloud API OAuth2/Webhooks), enriches dives with structured logbook metadata in **Cloudflare D1**, archives raw `.fit` telemetry in **Cloudflare R2**, and delivers offline-capable consultation through a responsive, installable **Web PWA**.

---

## Key Capabilities

- **Unified Dashboard & Custom SVG Analytics**
  - Hero KPIs (total dives, total underwater time, max/average depth, longest dive, and **SAC/RMV** average excluding incomplete dives) plus a highlighted **Latest Dive** card.
  - Zero-dependency custom SVG charts: **Dives per Month** (gradient column chart), **Accumulated Underwater Hours** (smooth area chart), **Depth Distribution** (ocean-depth gradient bars), **Seasonal Water Temperature** cards, and **Gas Mix** donut chart.
- **FFESSM-Inspired Logbook & Multi-Criteria Filtering**
  - Airy dive cards showing dive number (`N°`), dive site, highlighted date/time pill, duration, and max depth.
  - Collapsible multi-filter panel supporting combined filtering by **depth band** (`≤ 20 m`, `20–40 m`, `> 40 m`), **modality** (Guided, Autonomous, Training), **entry type** (Shore, Boat), **exploration type** (Cave, Wreck, Photo/Bio, Night, or custom), **year**, **gas mix**, and free-text search.
- **Interactive Suunto DM5-Style Dive Profile & Read-First Detail View**
  - Opens in clean **read-only mode** with top **Edit** toggle and modal confirmation before deleting.
  - Multi-layer SVG dive profile chart with `O(log N)` pointer scrubbing, non-overlapping top telemetry bar (depth, elapsed/total time, water temperature, tank pressure, ascent rate), configurable **red ascent-rate alerts** (`15 m/min` default), and deco stop (*paliers*) markers.
  - Automatic sequential dive numbering (`log_number`), unified **Site selector** (search saved catalog + OpenStreetMap Nominatim geocoding, manual GPS mode, and locked edit/clear state), and auto-saved catalogs for centers, buddies, computers, and gear.
- **Interactive Dive Sites Map (View-Only)**
  - Fixed OpenStreetMap/Leaflet map with crisp DOM markers, smooth progressive zoom, clickable popups, and a *View all sites* reset button, paired with an independently scrollable list of airy site cards that expand inline to list and open every dive at that site (online & offline).
- **Equipment, Certifications & Offline Calculators**
  - Dedicated **Equipment** (*Equipo / Équipements*) catalog manager for gear, certifications, dive centers, buddies, and computers, plus offline **Nitrox (MOD / EAD / Best Mix)** and **SAC / RMV** calculators.
- **Cloud-Native + Offline-First Android PWA**
  - Single-origin deployment on **Cloudflare Workers Static Assets** (`/api/*` + SPA bundle).
  - Automatic **IndexedDB + Service Worker** offline cache (`registerType: 'prompt'` with unsaved-changes guard), edge-to-edge safe-area support, 3-tier adaptive navigation (mobile bottom bar, tablet rail, desktop sidebar), **Google Sign-In (OIDC)** + **WebAuthn Passkey** biometric unlock, full **ES / FR** localization, and **Metric / Imperial** conversion.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend (Web PWA)** | React 19, TypeScript, Vite 6, Tailwind CSS v4, `vite-plugin-pwa` (Workbox), Leaflet, Lucide Icons, self-hosted IBM Plex Sans/Mono |
| **Backend (Edge API)** | Cloudflare Workers (TypeScript), zero-dependency binary `.fit` parser, Web Crypto HMAC-SHA256 JWT + WebAuthn ES256 |
| **Storage** | Cloudflare D1 (SQLite with 4 versioned migrations), Cloudflare R2 (`.fit` archive), IndexedDB (offline read replica) |
| **Testing & Quality** | Vitest (`19` backend + `11` web tests), ESLint, TypeScript strict (`tsc --noEmit`), `pre-commit`, Ruff, Gitleaks, Dependabot, `npm audit` |
| **CI/CD** | GitHub Actions (`security-gates.yml` + `deploy-cloudflare.yml` via Wrangler v4) |

---

## Repository Structure

```text
diving_app/
├── backend/                    # Cloudflare Workers API + D1 + R2 + Static Assets
│   ├── migrations/             # Authorized D1 SQL migrations (0001..0004)
│   ├── src/
│   │   ├── db/                 # D1 repositories (dives, catalogs, WebAuthn)
│   │   ├── fit/                # Zero-dependency Suunto .fit binary parser
│   │   ├── middleware/         # JWT session & security header middleware
│   │   ├── routes/             # REST API, Google OAuth, Passkeys & Suunto OAuth/Webhook
│   │   └── services/           # Ascent-rate/SAC metrics & non-destructive Suunto sync
│   └── tests/                  # Backend unit & integration tests (Vitest)
├── web/                        # React 19 + TypeScript + Vite Web PWA
│   ├── public/                 # PWA icons (SVG, PNG 192/512, maskable)
│   ├── src/
│   │   ├── charts/             # Interactive DM5-style profile chart & O(log N) geometry
│   │   ├── components/         # AppShell, AuthGate, DashboardCharts, SmartSelect, PwaUpdateBanner
│   │   ├── i18n/               # Complete Spanish (ES) & French (FR) dictionaries
│   │   ├── offline/            # IndexedDB offline cache layer
│   │   ├── pages/              # Dashboard, Logbook, DiveDetail, NewDiveChoice, Sites, GearCerts, Calculators, Settings
│   │   ├── services/           # Network-first API client, filters, calculators, unit converters
│   │   └── types/              # Shared TypeScript domain models
│   └── tests/                  # Web unit tests (Vitest)
├── docs/                       # Living technical & architectural documentation
├── scripts/security/           # Staging-area & tracked-files security/PII gate
├── .github/workflows/          # Security Gates & Cloudflare CI/CD pipelines
├── .gitleaks.toml              # Gitleaks secret & PII detection rules
└── .pre-commit-config.yaml     # Pre-commit hooks & linters
```

---

## Security & Quality Gates

This repository enforces automated security and engineering gates before any code reaches `main`:

1. **Pre-commit Hooks ([`.pre-commit-config.yaml`](./.pre-commit-config.yaml)):**
   - Inspects **staged Git index blobs** (`git show :<path>`), not just working-tree files.
   - Blocks `.env` files (except `.env.example`), unauthorized `.sql`/`.db`/`.bak` dumps, private keys/certificates, `.dev.vars`, DB connection strings, hardcoded API tokens, and PII.
   - Runs **Gitleaks**, **Ruff**, **ESLint**, and **TypeScript** checks across both packages.
2. **CI Security Gates ([`security-gates.yml`](./.github/workflows/security-gates.yml)):**
   - Full Git history secret scan with **Gitleaks** (`fetch-depth: 0`) on every push and pull request.
   - Policy/PII verification (`check_staged_security.py --all-tracked`), `pre-commit --all-files`, backend & web unit tests, and `npm audit --omit=dev --audit-level=high`.
3. **Dependency Management ([`dependabot.yml`](./.github/dependabot.yml)):**
   - Weekly Dependabot checks for GitHub Actions, `backend/`, and `web/`.
4. **Automated Cloudflare CI/CD ([`deploy-cloudflare.yml`](./.github/workflows/deploy-cloudflare.yml)):**
   - Runs only after `security-check` passes on `main`; builds the PWA, runs backend & web tests, applies D1 migrations, and deploys the unified Worker + Static Assets bundle.

---

## Local Development

### Prerequisites
- Node.js `>= 20` (tested on Node 24)
- Python `>= 3.11` (for `pre-commit` and security gate scripts)
- Cloudflare Wrangler CLI (installed locally via `backend/package.json`)

### Setup & Commands

```bash
# 1. Copy environment template (never commit .env or backend/.dev.vars)
cp .env.example .env

# 2. Install pre-commit hooks
pip install pre-commit
pre-commit install

# 3. Install dependencies
cd backend && npm ci
cd ../web && npm ci

# 4. Run full verification (typecheck, lint, tests, build)
cd ../backend && npm run typecheck && npm run lint && npm test
cd ../web && npm run typecheck && npm run lint && npm test && npm run build

# 5. Apply local D1 migrations & start local full-stack preview (http://localhost:8787)
cd ../backend
npx wrangler d1 migrations apply diving-db --local
npx wrangler dev --port 8787
```

---

## Production Deployment (Cloudflare + GitHub Actions)

1. **Create Cloudflare resources:**
   - D1 database (`diving-db`) and R2 bucket (`diving-fit-archive`), updating `database_id` in [`backend/wrangler.toml`](./backend/wrangler.toml).
2. **Configure Worker Secrets** (via `npx wrangler secret put <NAME>` inside `backend/`):
   - Required: `APP_USER_EMAIL`, `APP_JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   - Optional (Suunto Cloud API): `SUUNTO_CLIENT_ID`, `SUUNTO_CLIENT_SECRET`, `SUUNTO_SUBSCRIPTION_KEY`, `SUUNTO_WEBHOOK_SECRET`.
3. **Enable Automated CI/CD in GitHub (`Settings → Secrets and variables → Actions`):**
   - **Secrets:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - **Variable:** `CLOUDFLARE_DEPLOY_ENABLED` = `true`
4. **OAuth Redirect URIs:**
   - Register `<your-origin>/api/auth/google/callback` in Google Cloud Console (and optionally `<your-origin>/api/suunto/callback` in Suunto API Zone).

---

## GenAI-Assisted Engineering Approach

This application was built end-to-end using **Generative AI (agentic coding)** under strict human-in-the-loop governance and automated quality controls:

- **Spec-Driven & Iterative Delivery:** Architecture, database migrations (`0001`–`0004`), binary `.fit` protocol mapping, and UX refinements were specified and verified stage-by-stage in [`docs/TECHNICAL_DOCUMENTATION.md`](./docs/TECHNICAL_DOCUMENTATION.md).
- **Automated Guardrails over Trust:** Every AI-authored change is verified by deterministic local & CI gates — strict TypeScript (`tsc --noEmit`), ESLint, Ruff, Vitest (`30` automated tests), `npm audit`, Gitleaks (staging + full Git history), and a custom PII/security staging gate — with manual human commits (`git commit`/`git push`) controlling every release.
- **Zero-Bloat Engineering:** Core domain pieces (binary Suunto `.fit` parser, Web Crypto JWT/WebAuthn auth, DM5 dive profile chart with `O(log N)` pointer scrubbing, and Dashboard SVG analytics) were crafted without heavy third-party libraries to keep the PWA fast and maintainable.

---

## Documentation

For the full system architecture, Suunto `.fit` binary protocol mapping, SAC/ascent-rate formulas, database schema evolution, architectural trade-offs, and stage-by-stage changelog, see [**`docs/TECHNICAL_DOCUMENTATION.md`**](./docs/TECHNICAL_DOCUMENTATION.md).

# Diving App — Personal Dive Log & Telemetry Platform

> **AI/Agentic-Engineered Full-Stack Platform** — Built with automated security gates, Cloudflare edge infrastructure, and an offline-first, bilingual **Web PWA** (installable on desktop & Android).

Diving App is a personal diving logbook and telemetry analytics platform tailored for the **Suunto Nautic** dive computer. It ingests dive logs automatically from the **Suunto Cloud API** (via real-time webhooks and on-demand sync) and `.fit` binary files, enriches them with manual logbook metadata in a personal **Cloudflare D1** database, and delivers offline-ready analytics via an installable **Web PWA**.

---

## Key Capabilities

- **Suunto Nautic Telemetry & Non-Destructive Sync**
  - Automated ingestion via Suunto Cloud API Webhook + manual `"Sync now"` trigger, alongside a `.fit` binary importer.
  - **Non-destructive merge:** automated sync only adds new dives and never overwrites user-edited metadata.
- **Interactive Dive Profile Analysis**
  - Depth/time curve with click/tap inspection showing instantaneous depth, tank pressure (when recorded), ascent rate, elapsed time, and water temperature.
  - Automatic **red highlighting** for ascent segments exceeding the configured threshold (`15 m/min` default, editable in Settings).
- **Comprehensive Analytics & Logbook**
  - **Dashboard:** total dives, underwater hours, max/average depth, personal records, and **SAC/RMV** consumption average (automatically excluding dives missing tank/pressure data).
  - **Evolution Charts:** dives per month/year, accumulated hours, depth-range distribution, seasonal water temperature, and gas mix breakdown (Air, Nitrox, Trimix).
  - **Searchable Logbook:** advanced filtering by site, year, depth, buddy, dive center, and tags.
  - **Dive Sites:** interactive OpenStreetMap/Leaflet map with manual pin placement fallback and offline site rankings.
  - **Extras:** gear & maintenance tracker, certifications wallet, and quick Nitrox / SAC calculators.
- **Multi-Device Cloud + Offline Read Access**
  - **Cloudflare D1** acts as the single source of truth across devices, paired with automatic local caching (**IndexedDB + Service Worker**) for zero-connectivity consultation on dive boats and one-tap Android PWA installation from Chrome.
- **Bilingual & Unit-Flexible**
  - Full **Spanish (ES)** and **French (FR)** localization.
  - **Metric** default (`m`, `bar`, `°C`, `L`, `kg`) with an **Imperial** toggle (`ft`, `psi`, `°F`, `cu ft`, `lb`).

---

## Repository Structure

```text
diving_app/
├── backend/                    # Cloudflare Workers API + D1 (SQLite) + R2 + Suunto Sync
│   ├── migrations/             # Authorized D1 SQL schema migrations
│   ├── src/
│   │   ├── db/                 # D1 repository & query layer
│   │   ├── fit/                # Suunto .fit binary parser & ascent-rate analyzer
│   │   ├── middleware/         # Personal JWT / Cloudflare Access authentication
│   │   ├── routes/             # REST endpoints & Suunto Webhook receiver
│   │   └── services/           # Suunto OAuth/API sync & non-destructive merge
│   └── tests/                  # Backend unit & integration tests
├── web/                        # React + TypeScript + Vite PWA (Cloudflare Pages)
│   ├── public/                 # PWA manifest, icons & service worker assets
│   ├── src/
│   │   ├── charts/             # Interactive dive profile & evolution charts
│   │   ├── components/         # Reusable UI components
│   │   ├── i18n/               # Spanish (ES) & French (FR) dictionaries
│   │   ├── offline/            # IndexedDB cache & offline sync layer
│   │   ├── pages/              # Dashboard, Logbook, Dive Detail, Sites, Gear, Settings
│   │   ├── services/           # API client & Metric/Imperial converters
│   │   └── types/              # Shared TypeScript domain models
│   └── tests/                  # Web unit & component tests
├── docs/                       # Technical documentation & architecture specs
├── fixtures/                   # Anonymized test fixtures (real .fit files are gitignored)
├── scripts/security/           # Pre-commit & CI staging/history security gates
├── .github/workflows/          # Security Gates & Cloudflare CI/CD pipelines
├── .gitleaks.toml              # Gitleaks secret & PII detection rules
└── .pre-commit-config.yaml     # Pre-commit hooks & linters
```

---

## Security & CI/CD Gates

This repository enforces strict security and quality gates before any code reaches `main`:

1. **Pre-commit Hooks (`pre-commit.com`):**
   - Inspects **staged Git index blobs** (`git show :<path>`), not just working-tree files.
   - Blocks `.env` files (except `.env.example`), unauthorized `.sql`/`.db`/`.bak` dumps, private keys/certificates, production configs, DB connection strings, hardcoded API tokens, and personal data (PII).
   - Runs **Gitleaks** on the staging area and automated code linters (`ruff`, YAML/JSON/whitespace checks).
2. **CI Security Gates ([security-gates.yml](file:///c:/Users/dalex/Documents/Dev/diving_app/.github/workflows/security-gates.yml)):**
   - Full Git history secret scan with **Gitleaks** (`fetch-depth: 0`) on every push and pull request.
   - Repository-wide policy, PII, and `pre-commit --all-files` verification.
3. **Dependency & SCA Management ([dependabot.yml](file:///c:/Users/dalex/Documents/Dev/diving_app/.github/dependabot.yml)):**
   - Weekly Dependabot updates + CI **OSV-Scanner** and `npm audit --audit-level=high` gates.
4. **Automated Cloudflare CI/CD ([deploy-cloudflare.yml](file:///c:/Users/dalex/Documents/Dev/diving_app/.github/workflows/deploy-cloudflare.yml)):**
   - Gated behind passing security checks; applies D1 migrations, deploys Cloudflare Workers, and builds/deploys the Web PWA to Cloudflare Pages on push to `main`.

---

## Getting Started (Local Setup)

1. **Copy environment template** (never commit `.env`):
   ```bash
   cp .env.example .env
   ```
2. **Install pre-commit hooks** (required for contributors):
   ```bash
   pip install pre-commit
   pre-commit install
   ```
3. **Review technical specifications:**
   See [docs/TECHNICAL_DOCUMENTATION.md](file:///c:/Users/dalex/Documents/Dev/diving_app/docs/TECHNICAL_DOCUMENTATION.md) for the full architecture, Suunto `.fit` binary mapping, database design, and testing strategy.

---

## Development Roadmap

| Stage | Scope | Status |
| :--- | :--- | :--- |
| **Stage 1** | Pre-commit Hooks (`pre-commit.com`), Gitleaks & CI Security Gates | Completed |
| **Stage 2** | Monorepo directory structure & Cloudflare CI/CD workflow | Completed |
| **Stage 3** | English `README.md` & living `TECHNICAL_DOCUMENTATION.md` | Completed |
| **Stage 4** | Backend API, D1 schema, R2 archival, Suunto `.fit` parser & Cloud API sync | Completed |
| **Stage 5** | Web PWA (ES/FR, interactive dive chart, dashboard, offline cache, Android installable) | Completed |
| **Stage 6** | Unified Workers Static Assets deployment, CI/CD & Definition of Done | Completed |
| **Stage 7** | Logbook v2 (Paliers, smart auto-saved catalogs, location search, draft FIT, DM5 chart & unsaved guard) | Completed |

---

## Production Deployment Checklist

1. **GitHub Repository Settings (`Settings → Secrets and variables → Actions`):**
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (`72a8537e848ff38b562b789901671eec`).
   - Variable: `CLOUDFLARE_DEPLOY_ENABLED` = `true`.
2. **Cloudflare Worker Secrets** (set once via `npx wrangler secret put <NAME>` inside `backend/`):
   - `APP_USER_EMAIL`, `APP_JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUUNTO_CLIENT_ID`, `SUUNTO_CLIENT_SECRET`, `SUUNTO_SUBSCRIPTION_KEY`, `SUUNTO_WEBHOOK_SECRET`.
3. **Custom Domain (`diving.dalexmuro.com`):**
   - Attach `diving.dalexmuro.com` under *Cloudflare Dashboard → Workers & Pages → `diving-app-api` → Settings → Domains & Routes* (requires `dalexmuro.com` DNS zone active in Cloudflare, or use the generated `https://diving-app-api.<subdomain>.workers.dev` URL).
   - Ensure Google OAuth and Suunto API Zone redirect/webhook URIs match your active origin (`/api/auth/google/callback`, `/api/suunto/callback`, `/api/webhooks/suunto`).

# Technical Documentation

> **Living Document:** This specification reflects the implemented architecture, data model, binary `.fit` parser, security gates, and verification status of **Journal de plongée / Diario de buceo** — a full-stack personal dive platform engineered end-to-end with **Generative AI (agentic workflows)** under strict human review and automated CI/CD guardrails.

---

## 1. System Architecture

The platform follows a **cloud-source-of-truth, offline-capable** architecture hosted on **Cloudflare Workers with Static Assets**, serving both the REST API (`/api/*`) and the responsive **Web PWA** from a single origin (eliminating CORS complexity):

```text
+-------------------+       Webhook / OAuth2       +-----------------------------+
| Suunto Cloud API  | ---------------------------> |  Cloudflare Workers         |
| (Suunto Nautic)   |   or Manual .fit Upload      |  - Binary FIT Parser        |
+-------------------+                              |  - Non-Destructive Merge    |
                                                   |  - Google OIDC + Passkeys   |
                                                   |  - Static Assets (Web PWA)  |
                                                   +--------------+--------------+
                                                                  |
                                                     SQL          |  Raw .fit (R2)
                                                   +--------------v--------------+
                                                   | Cloudflare D1 (SQLite)      |
                                                   | + Cloudflare R2             |
                                                   +--------------+--------------+
                                                                  |
                                                         Same-Origin HTTPS JSON
                                                   +--------------v--------------+
                                                   |  Web PWA (React 19 + Vite)  |
                                                   |  - Custom SVG Charts        |
                                                   |  - IndexedDB + SW Cache     |
                                                   |  - Leaflet OSM + ES / FR    |
                                                   |  - Android Chrome Install   |
                                                   +-----------------------------+
```

### Architectural Principles
1. **Single Source of Truth:** Cloudflare D1 stores all canonical dive records, telemetry samples, dive sites, catalogs (centers, buddies, computers, gear, certifications), and user preferences.
2. **Non-Destructive Automated Sync:** Suunto webhooks and manual sync runs are strictly idempotent (keyed by `suunto_workout_key` / `.fit` SHA-256 hash). They insert new dives or populate missing telemetry fields without overwriting user-edited metadata.
3. **Offline Read Availability:** The Web PWA maintains a local IndexedDB + Service Worker cache (with `Cache-Control: no-store, private` on `/api/*` and SW `runtimeCaching` restricted strictly to public OSM map tiles) so the dashboard, logbook, site dive lists, and cached dive profiles remain viewable offline.

---

## 2. Suunto Nautic `.fit` & Cloud API Analysis

Verified against real **Suunto Nautic** `.fit` exports (FIT Protocol `32`, Profile `21176`):

### 2.1 Extracted FIT Messages & Fields
| FIT Global Message | ID | Extracted Data | Notes |
| :--- | :---: | :--- | :--- |
| `file_id` / `device_info` | `0` / `23` | Product (`"Suunto Nautic"`), battery % at start | Identifies dive computer automatically |
| `session` | `18` | `start_time`, `timestamp` (end), `total_elapsed_time` (ms), `sport` (`53`), `sub_sport` (`46`), `avg_depth` (mm), `max_depth` (mm), `avg_temperature` (°C), `min_temperature` (°C) | Depths are stored in **millimeters** (divided by `1000` for meters) |
| `session` Developer Fields | `18` (`206`) | `description` (UTF-8 site name), `dive_number_in_series`, `surface_time` (s), `peak_epoc`, `max_depth` (float m) | Extracted via `field_description` (`206`) + `developer_data_id` (`207`) |
| `record` | `20` | `timestamp` (1 Hz), `temperature` (`f_13`, 1 Hz), `depth` (`f_92`, mm, variable interval) | Depth is recorded at change intervals while temperature is 1 Hz |
| `dive_gas` | `259` | `oxygen_content` (%), `helium_content` (%), `status` | Maps to Air (`21% O2`), Nitrox (`>21% O2`), or Trimix (`He > 0%`) |
| `dive_settings` | `258` | `gf_low`, `gf_high` (e.g. `40 / 85`) | Gradient factors stored for technical reference |

### 2.2 Known Gaps & Mitigation
- **Tank Pressure (`tank_update` / `tank_summary`):** Absent when diving without a wireless Tank POD. Mitigated via manual start/end pressure inputs with automatic consumed-pressure and SAC calculation.
- **GPS Coordinates:** Not embedded underwater in `.fit` `record` messages (surface entry GPS is available in companion `.gpx` exports). Mitigated via unified site search (saved catalog + OpenStreetMap Nominatim geocoding) and manual Lat/Lng entry on the dive form.
- **Ascent Rate:** Computed dynamically from consecutive depth samples:
  $$\text{Ascent Rate (m/min)} = \frac{\text{depth}_{i-1} - \text{depth}_i}{\Delta t_i / 60}$$
  Segments exceeding the configured threshold (`15 m/min` default) are rendered in **red** on the interactive dive profile chart and surfaced in the inspected-point readout bar.

---

## 3. Domain Data Model & Calculations

### 3.1 Database Migrations (`backend/migrations/`)
1. [`0001_init.sql`](../backend/migrations/0001_init.sql): Core tables (`dive_sites`, `dives`, `dive_samples`, `gear_items`, `certifications`, `suunto_tokens`, `webauthn_credentials`, `user_settings`).
2. [`0002_catalogs_and_paliers.sql`](../backend/migrations/0002_catalogs_and_paliers.sql): Catalog tables (`dive_centers`, `buddies`, `dive_computers`), gear `brand`/`model`, `deco_stops_json`, `buddies_json`, `gear_used_json`, and center location/GPS fields.
3. [`0003_ffessm_fields.sql`](../backend/migrations/0003_ffessm_fields.sql): FFESSM logbook fields (`log_number`, `dive_mode`, `tank_config`, `water_env`, `day_period`, `sea_state`, `weather`, `current_strength`).
4. [`0004_dive_types.sql`](../backend/migrations/0004_dive_types.sql): `dive_types_json` storing entry type (`shore` / `boat`) and exploration types (`cave`, `wreck`, `photo_bio`, `night`, or custom values).

### 3.2 Dive Record Fields & Behavior
- **Automatic Dive Numbering:** New manual and `.fit` dives automatically receive the next sequential `log_number` (`MAX(COALESCE(MAX(log_number), 0), COUNT(*)) + 1`) on insert and display it as read-only in the UI.
- **Read-First Detail View:** Opening an existing dive renders a clean read-only summary across 3 soft-blue tinted sections (Location & Dive Center, Basic Information + Deco Stops, Complementary Information). Clicking **Edit** unlocks the form; clicking **Delete** requires explicit modal confirmation.
- **Unified Site Workflow:** Dive sites are created/edited strictly within a dive record using a 3-state selector (**Search** saved sites + OSM Nominatim → **Manual** name/lat/lng → **Locked** registered card with Edit/Clear controls).

### 3.3 SAC / RMV Calculation Rule
Surface Air Consumption (**SAC**) is computed per dive only when all required inputs exist (`start_pressure`, `end_pressure`, `tank_volume_liters`, `avg_depth_m`, `duration_min`):
$$\text{SAC (L/min)} = \frac{(\text{P}_{\text{start}} - \text{P}_{\text{end}}) \times \text{V}_{\text{tank}}}{\left(\frac{\text{Depth}_{\text{avg}}}{10} + 1\right) \times \text{Duration}_{\text{min}}}$$
Dives missing pressure or tank volume are **automatically excluded** from the global SAC average.

### 3.4 Navigation & Modules
- **Primary Tabs (3-tier adaptive: mobile bottom bar, tablet rail, desktop sidebar):**
  - `Dashboard`: KPI cards, Latest Dive highlight, and 4 custom SVG visual charts (Dives per Month, Accumulated Hours, Depth Distribution, Seasonal Temperature + Gas Donut).
  - `Logbook` (*Bitácora / Carnet*): FFESSM-inspired airy dive cards with collapsible multi-criteria filter panel (`≤ 20 m`, `20–40 m`, `> 40 m`, modality, entry type, exploration type, year, gas, text search).
  - `Sites` (*Sitios / Sites*): View-only fixed OpenStreetMap/Leaflet map with crisp DOM markers, smooth zoom, clickable popups, and *View all sites* reset button, above independently scrollable site cards expanding inline to show and open dives.
- **Secondary Menu:** `Equipment` (*Equipo / Équipements* — gear, certifications, centers, buddies, computers), `Calculators` (Nitrox MOD/EAD/Best Mix & SAC), and `Settings` (Language ES/FR, Units Metric/Imperial, Ascent threshold, Suunto API Connect/Sync, Passkey registration, PWA install, Sign Out).

### 3.5 Authentication, Biometrics & Localization
- **Primary Identity Provider:** **Google Sign-In (OAuth 2.0 / OIDC)** verified by the Cloudflare Worker against an allowlisted personal account (`APP_USER_EMAIL`), issuing HttpOnly session JWTs.
- **Biometric Unlock:** **WebAuthn / Passkey** (`ES256`) registration and login for fast fingerprint unlock on Android Chrome.
- **Units & Localization:** Canonical **Metric** storage (`m`, `bar`, `°C`, `L`, `kg`) with client-side **Imperial** conversion, and 100% key-parity **Spanish (`es`)** / **French (`fr`)** dictionaries verified by automated unit tests.

---

## 4. Security Architecture & CI/CD

### 4.1 Pre-commit & Staging-Area Gates
Configured in [`.pre-commit-config.yaml`](../.pre-commit-config.yaml) and [`.gitleaks.toml`](../.gitleaks.toml):
- **Staging-Area Inspection:** [`scripts/security/check_staged_security.py`](../scripts/security/check_staged_security.py) reads staged blobs directly from the Git index (`git show :<path>`), blocking:
  - `.env` files (only `.env.example` is permitted) and `.dev.vars`.
  - Unauthorized `.sql`, `.dump`, `.bak`, `.sqlite`, `.db` files (authorized migrations are allowlisted in [`.security/authorized-sql.txt`](../.security/authorized-sql.txt)).
  - Certificates and private keys (`.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.keystore`, `id_rsa`, etc.).
  - Database connection strings, hardcoded Suunto/Cloudflare/JWT secrets, and potential PII. *(Auto-generated `package-lock.json` files are exempted strictly from the PII email regex while remaining scanned for secrets and connection strings.)*
- **Local Real Data Isolation:** Personal `.fit` / `.pdf` exports and local notes reside in `local-data/` and `notas/` (gitignored).

### 4.2 CI Security Gates & Deployment
- **[`security-gates.yml`](../.github/workflows/security-gates.yml):** Full Git history Gitleaks scan (`fetch-depth: 0`), `check_staged_security.py --all-tracked`, `pre-commit run --all-files`, backend & web unit tests, and `npm audit --omit=dev --audit-level=high`.
- **[`dependabot.yml`](../.github/dependabot.yml):** Weekly automated dependency checks for GitHub Actions and `backend/` / `web/` npm packages.
- **[`deploy-cloudflare.yml`](../.github/workflows/deploy-cloudflare.yml):** Triggered on push to `main`; gated on `security-check` and `vars.CLOUDFLARE_DEPLOY_ENABLED == 'true'`; tests & builds `web/`, tests `backend/`, applies remote D1 migrations, and deploys the unified Worker + Static Assets bundle via Wrangler v4.

---

## 5. Architectural Trade-Offs

| Decision | Chosen Option | Alternatives | Trade-offs & Justification | What Could Change This Decision |
| :--- | :--- | :--- | :--- | :--- |
| **Cloud Backend & Hosting** | Cloudflare Workers + D1 + R2 + Static Assets | Supabase + Vercel, or Self-hosted VPS (Docker + Postgres) | Zero-cost free tier, global edge latency, single-origin `/api/*` + SPA eliminates CORS, and one deployment unit. Trade-off: D1 SQLite dialect, mitigated by standard SQL migrations and isolated repository queries in `backend/src/db/`. | Multi-tenant SaaS growth requiring heavy relational analytics or Postgres-specific extensions. |
| **Client Strategy** | Single Web PWA (React 19 + Vite) | Separate Web + Native Android (Jetpack Compose) | One codebase serves desktop and Android Chrome (installable, offline IndexedDB + SW, WebAuthn fingerprint unlock), avoiding duplicate UI/testing overhead. | Need for direct Bluetooth/USB dive-computer sync from Android without Suunto App. |
| **Charts Strategy** | Custom zero-dependency SVG charts | Chart.js / Recharts / ECharts | Zero bundle bloat, full control over DM5 dive profile scrubbing (`O(log N)` binary search, 2 `<path>` nodes, `60 fps`), and cohesive nautical visual styling. | Complex interactive BI dashboards requiring zoomable multi-axis datasets. |
| **Offline Strategy** | Cloud D1 source of truth + IndexedDB read cache | Local-first CRDT / bidirectional offline writes | Eliminates complex multi-device conflict resolution while guaranteeing full offline consultation of dashboard, logbook, sites, and cached dive profiles on dive boats. | Requirement to create/edit dives offline and auto-merge later. |
| **Auth & Biometrics** | Google OAuth 2.0 + email allowlist + WebAuthn | Custom email/password or Cloudflare Access | Frictionless single-user security without storing passwords; WebAuthn provides native fingerprint unlock on Android Chrome. | Opening the app to multiple public users (would require multi-tenant schema & user accounts). |

---

## 6. Testing Strategy

- **Backend (`backend/tests/` — 19 tests across 6 suites):** Schema validation, `.fit` binary parser, ascent-rate & SAC/Nitrox calculators, JWT/Google OAuth/WebAuthn auth, security & `Cache-Control` headers, and API + non-destructive Suunto sync.
- **Web PWA (`web/tests/` — 11 tests across 5 suites):** Metric/Imperial conversions, ES/FR translation key parity, calculators & cumulative hours series, `O(log N)` profile geometry + multi-criteria logbook filtering, and IndexedDB offline cache.

---

## 7. Living Changelog

- **Stage 1–3:** Pre-commit + Gitleaks + custom staging-area security & PII gate, monorepo scaffolding, CI workflows, and living documentation.
- **Stage 4 (`STEP-01`–`STEP-04`):** Cloudflare D1 (`0001_init.sql`), R2 archival, Web Crypto JWT + Google OAuth + WebAuthn Passkeys, zero-dependency Suunto `.fit` binary parser, ascent-rate & SAC metrics, Suunto Cloud API sync, and full REST API.
- **Stage 5–6 (`STEP-05`–`STEP-08`):** React 19 + Tailwind v4 + Vite Web PWA, ES/FR localization, Metric/Imperial converters, IndexedDB offline cache, interactive dive profile chart, Leaflet sites map, Nitrox/SAC calculators, and unified Cloudflare Workers Static Assets deployment.
- **Stage 7 (`STEP-09`–`STEP-12`):** Migration `0002_catalogs_and_paliers.sql`, full CRUD catalogs, stateless draft `.fit` parsing, DM5-style multi-layer `DiveProfileChart`, 2-step quick manual dive creation, unsaved-changes guard, and 3-section `DiveDetailPage`.
- **Stage 8 (`STEP-13`):** Android PWA production readiness — `Cache-Control: no-store, private` on `/api/*`, `registerType: 'prompt'` + `PwaUpdateBanner`, raster/maskable icons, edge-to-edge safe areas, 3-tier adaptive navigation, History API back-gesture sync, `React.lazy` code splitting (`-42%` initial JS), `O(log N)` pointer scrubbing on `DiveProfileChart`, and self-hosted IBM Plex fonts.
- **Stage 9 (`STEP-14`):** FFESSM logbook migrations (`0003_ffessm_fields.sql`, `0004_dive_types.sql`), FFESSM-inspired airy logbook cards with multi-criteria filter drawer (`≤ 20 m`, `20–40 m`, `> 40 m`, modality, entry, exploration, year, gas), merged **Dashboard** with custom SVG charts (removing separate `StatsPage`), view-only fixed **Sites** map with DOM markers, smooth zoom, clickable popups & airy expandable site cards, read-only-first **Dive Detail** with top Edit toggle, auto-numbered dives, unified site search/manual/lock workflow, soft-blue section styling, disabled Suunto sync when disconnected, and rebranding to **Journal de plongée / Diario de buceo**.

---

## 8. GenAI Engineering Governance

This application was built end-to-end with **Generative AI (agentic engineering)** paired with deterministic quality and security controls:
- **Human-in-the-Loop Release Control:** All product decisions, architecture approvals, database reconciliations, and Git commits/pushes are explicitly reviewed and executed by the repository owner.
- **Deterministic Verification Loop:** Every change is validated automatically through TypeScript strict checking, ESLint, Ruff, `30` unit/integration tests (`19` backend + `11` web), PWA build verification, SCA (`npm audit`), Gitleaks, and custom staging-area PII/secret inspection.
- **Living Documentation Discipline:** Architecture diagrams, trade-offs, binary protocol specs, and the stage-by-stage changelog are continuously synchronized with the actual codebase.

---

## 9. Definition of Done Verification

| Category | Status | Evidence |
| :--- | :---: | :--- |
| **Functionality** | Passed | Suunto `.fit` parser + Cloud API OAuth/Webhook/Sync, R2 archival, Google Sign-In + WebAuthn Passkeys, unified Dashboard with custom SVG charts, FFESSM Logbook cards + multi-filter drawer, read-first Dive Detail with DM5 profile chart & unified Site selector, view-only Sites map + expandable dive lists, Equipment/Certs catalogs, Nitrox/SAC calculators, ES/FR, Metric/Imperial, IndexedDB + SW offline cache. |
| **Quality & Testing** | Passed | `19/19` Backend tests + `11/11` Web tests passing; `eslint` and `tsc --noEmit` passing with `0` errors across both packages; PWA production build verified (`dist/sw.js` + `manifest.webmanifest`). |
| **Security & SCA** | Passed | `pre-commit run --all-files` (`13/13` hooks passed), `check_staged_security.py --all-tracked` (`98` files passed), Gitleaks scan (`0` leaks), `npm audit --omit=dev --audit-level=high` (`0` vulnerabilities in both `backend/` and `web/`). |
| **Public-Repo Hygiene** | Passed | Zero local `file:///` paths, zero personal domains/emails/account IDs in tracked docs, `.env.example` sanitized, `local-data/` and `notas/` strictly gitignored. |

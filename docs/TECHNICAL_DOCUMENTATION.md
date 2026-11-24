# Technical Documentation

> **Living Document:** This specification is updated at the completion of every development stage to reflect the exact implemented architecture, schemas, APIs, and verification results.

---

## 1. System Architecture

The platform follows a **cloud-source-of-truth, offline-capable** architecture hosted entirely on **Cloudflare**, serving a responsive **Web PWA** installable on both desktop and Android:

```text
+-------------------+       Webhook / REST        +---------------------------+
| Suunto Cloud API  | --------------------------> |  Cloudflare Workers API   |
| (Suunto Nautic)   |   OAuth 2.0 + Sub Key       |  - FIT Binary Parser      |
+-------------------+                             |  - Non-Destructive Merge  |
                                                  |  - Google OAuth + JWT     |
                                                  +-------------+-------------+
                                                                |
                                                   SQL          |  Raw .fit (opt.)
                                                  +-------------v-------------+
                                                  | Cloudflare D1 (SQLite)    |
                                                  | + Cloudflare R2           |
                                                  +-------------+-------------+
                                                                |
                                                       HTTPS REST / JSON
                                                  +-------------v-------------+
                                                  |   Web PWA (Pages)         |
                                                  | - React + TypeScript      |
                                                  | - IndexedDB + SW Cache    |
                                                  | - Leaflet + ES / FR       |
                                                  | - Android Chrome Install  |
                                                  +---------------------------+
```

### Architectural Principles
1. **Single Source of Truth:** Cloudflare D1 holds all canonical dive records, telemetry samples, dive sites, gear items, and certifications.
2. **Non-Destructive Automated Sync:** Suunto webhooks and manual `"Sync now"` runs are strictly idempotent (keyed by `suunto_workout_key` / `.fit` SHA-256 hash). They only insert new dives or populate missing telemetry fields; user-edited logbook metadata is never overwritten.
3. **Offline Read Availability:** The Web PWA maintains a local IndexedDB + Service Worker cache so all statistics, logbook entries, and dive profile curves remain viewable without network connectivity.

---

## 2. Suunto Nautic `.fit` & Cloud API Analysis

Verified against a real **Suunto Nautic** `.fit` export (`24,318 bytes`, FIT Protocol `32`, Profile `21176`):

### 2.1 Extracted FIT Messages & Fields
| FIT Global Message | ID | Extracted Data | Notes |
| :--- | :---: | :--- | :--- |
| `file_id` / `device_info` | `0` / `23` | Product (`"Suunto Nautic"`), battery % at start | Identifies dive computer automatically |
| `session` | `18` | `start_time`, `timestamp` (end), `total_elapsed_time` (ms), `sport` (`53`), `sub_sport` (`46`), `avg_depth` (mm), `max_depth` (mm), `avg_temperature` (°C), `min_temperature` (°C) | Depths are stored in **millimeters** (divide by `1000` for meters) |
| `session` Developer Fields | `18` (`206`) | `description` (UTF-8 site name), `dive_number_in_series`, `surface_time` (s), `peak_epoc`, `max_depth` (float m) | Extracted via `field_description` (`206`) + `developer_data_id` (`207`) |
| `record` | `20` | `timestamp` (1 Hz), `temperature` (`f_13`, 1 Hz), `depth` (`f_92`, mm, variable interval) | Depth is recorded at change intervals (~304 points in a 46-min dive) while temperature is 1 Hz |
| `dive_gas` | `259` | `oxygen_content` (%), `helium_content` (%), `status` | Maps to Air (`21% O2`), Nitrox (`>21% O2`), or Trimix (`He > 0%`) |
| `dive_settings` | `258` | `gf_low`, `gf_high` (e.g. `40 / 85`) | Gradient factors stored for technical reference |

### 2.2 Known Gaps & Mitigation
- **Tank Pressure (`tank_update` / `tank_summary`):** Not present in standard Suunto `.fit` exports (or when diving without a Tank POD). Mitigated via manual start/end pressure fields in the logbook and optional JSON/extensions inspection from Suunto Cloud API once API credentials are active.
- **GPS Coordinates:** Not embedded in `.fit` `record` messages underwater. Mitigated via an interactive **OpenStreetMap/Leaflet** pin selector on the dive site form, with offline fallback to site rankings/lists.
- **Ascent Rate:** Not precomputed in `.fit` records. Computed dynamically from consecutive depth samples:
  $$\text{Ascent Rate (m/min)} = \frac{\text{depth}_{i-1} - \text{depth}_i}{\Delta t_i / 60}$$
  Any segment where ascent rate exceeds the configured threshold (`15 m/min` default) is flagged and rendered in **red** on the interactive dive profile chart.

---

## 3. Domain Data Model & Calculations

### 3.1 Dive Record Fields
- **Automated / Telemetry (editable):** Date, start time, end time, duration, dive computer, max depth, avg depth, min/avg water temperature, depth/temp/pressure time-series curve, gas mix (Air / Nitrox / Trimix, `%O2`, `%He`), deco status & deco time, gradient factors, surface interval.
- **Manual Logbook Metadata (protected from sync overwrite):** Start pressure, end pressure, consumed pressure (auto-calculated), tank capacity & material (e.g. `12L Steel`, `15L`, `11.1L Alu`), ballast/weight, water type (salt / fresh), dive site name & GPS coordinates, buddy, dive center, tags (`night`, `wreck`, `drift`, etc.), subjective ratings (**Visibility**, **Buoyancy**, **Feeling/Ressenti** using `poor` / `normal` / `good` / `excellent` scales), and free-text notes.

### 3.2 SAC / RMV Calculation Rule
Surface Air Consumption (**SAC**) is computed per dive only when all required inputs exist (`start_pressure`, `end_pressure`, `tank_volume_liters`, `avg_depth_m`, `duration_min`):
$$\text{SAC (L/min)} = \frac{(\text{P}_{\text{start}} - \text{P}_{\text{end}}) \times \text{V}_{\text{tank}}}{\left(\frac{\text{Depth}_{\text{avg}}}{10} + 1\right) \times \text{Duration}_{\text{min}}}$$
Dives missing pressure or tank volume are **automatically excluded** from the global SAC average so they do not skew statistics.

### 3.3 Navigation & Modules
- **Primary Navigation (Web & Android):**
  - **Home / Start:** `Dashboard` (KPIs, personal records, latest dive highlight).
  - **Primary Tabs:** `Dashboard`, `Logbook` (Bitácora), `Statistics` (Estadísticas), `Sites` (Sitios).
  - **Secondary / Utility Menu:** `Gear & Certifications` (simple lists without reminder alerts or photo uploads), `Nitrox / SAC Calculators`, and `Settings` (Language ES/FR, Units Metric/Imperial, Ascent threshold, `.fit` manual import, Sync now).

### 3.4 Authentication & Mobile Biometrics
- **Primary Identity Provider:** **Google Sign-In (OAuth 2.0 / OIDC)** verified by the Cloudflare Worker against an allowlisted personal Google account (`APP_USER_EMAIL` / `sub` claim), issuing short-lived session JWTs + refresh tokens.
- **Mobile Fingerprint Unlock:** After initial Google Sign-In, the PWA supports **WebAuthn / Passkey** biometric unlock on Android Chrome (fingerprint) for quick re-authentication.

### 3.5 Units & Localization
- **Units:** Stored canonically in **Metric** (`m`, `bar`, `°C`, `L`, `kg`) in D1 and converted dynamically in the client UI when **Imperial** (`ft`, `psi`, `°F`, `cu ft`, `lb`) is selected.
- **Localization:** Full **Spanish (`es`)** and **French (`fr`)** translation dictionaries, including standardized subjective rating labels.

---

## 4. Security Architecture & CI/CD

### 4.1 Pre-commit & Staging-Area Gates
Configured in [.pre-commit-config.yaml](file:///c:/Users/dalex/Documents/Dev/diving_app/.pre-commit-config.yaml) and [.gitleaks.toml](file:///c:/Users/dalex/Documents/Dev/diving_app/.gitleaks.toml):
- **Staging-Area Inspection:** [check_staged_security.py](file:///c:/Users/dalex/Documents/Dev/diving_app/scripts/security/check_staged_security.py) reads staged blobs directly from the Git index (`git show :<path>`), blocking:
  - `.env` files (only `.env.example` is permitted).
  - Unauthorized `.sql`, `.dump`, `.bak`, `.sqlite`, `.db` files (authorized D1 migrations must match [.security/authorized-sql.txt](file:///c:/Users/dalex/Documents/Dev/diving_app/.security/authorized-sql.txt)).
  - Certificates and private keys (`.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.keystore`, `id_rsa`, etc.).
  - Database backups/exports and private production configs (`secrets.*`, `wrangler.prod.*`, `.dev.vars`, `local.properties`).
  - Database connection strings, hardcoded Suunto/Cloudflare/JWT secrets, and potential PII (emails, contextual phone numbers, personal IDs).
- **Local Real Data Isolation:** Personal `.fit` files reside in `local-data/` (gitignored).

### 4.2 CI Security Gates & Deployment
- **[security-gates.yml](file:///c:/Users/dalex/Documents/Dev/diving_app/.github/workflows/security-gates.yml):** Checks out full Git history (`fetch-depth: 0`) to run **Gitleaks** across all historical commits, enforces `check_staged_security.py --all-tracked`, runs `pre-commit run --all-files`, and runs **OSV-Scanner** + `npm audit --audit-level=high` (SCA).
- **[dependabot.yml](file:///c:/Users/dalex/Documents/Dev/diving_app/.github/dependabot.yml):** Weekly automated dependency update checks for GitHub Actions and `backend/` / `web/` npm ecosystems.
- **[deploy-cloudflare.yml](file:///c:/Users/dalex/Documents/Dev/diving_app/.github/workflows/deploy-cloudflare.yml):** Runs after security gates pass; applies D1 migrations, deploys the Worker, and deploys the Web PWA to Cloudflare Pages when `CLOUDFLARE_DEPLOY_ENABLED == 'true'`.

---

## 5. Independent Architectural Review & Trade-Offs

| Decision | Chosen Option | Alternatives | Trade-offs & Justification | What Could Change This Decision |
| :--- | :--- | :--- | :--- | :--- |
| **Cloud Backend & DB** | Cloudflare Workers + D1 + R2 | Supabase + Vercel, or Self-hosted VPS (Docker + Postgres) | Zero-cost free tier, global edge latency, single vendor for API/DB/Pages, and `/api/*` same-origin routing eliminates CORS. Trade-off: Cloudflare D1 SQLite dialect lock-in, mitigated by keeping SQL standard in migrations and isolating queries in `backend/src/db/`. | Multi-tenant SaaS growth requiring heavy relational analytics or Postgres-specific extensions. |
| **Client Strategy** | Single Web PWA (React + Vite) | Separate Web + Native Android (Jetpack Compose) | One codebase serves desktop and Android Chrome (installable, offline IndexedDB + SW, WebAuthn fingerprint unlock), avoiding duplicate UI/testing overhead. | Need for direct Bluetooth/USB dive-computer sync from Android without Suunto App. |
| **Offline Strategy** | Cloud D1 source of truth + IndexedDB read cache | Local-first CRDT / bidirectional offline writes | Eliminates complex multi-device conflict resolution while guaranteeing full offline consultation of stats and dive profiles on dive boats. | Requirement to edit/create dives offline on boats and auto-merge later. |
| **Auth & Biometrics** | Google OAuth 2.0 + email allowlist + WebAuthn | Custom email/password or Cloudflare Access | Frictionless single-user security without storing passwords; WebAuthn provides native fingerprint unlock on Android Chrome. | Adding multiple public users (would require removing the single-email allowlist). |

---

## 5. Testing Strategy

- **Backend (`backend/tests/`):** Unit tests for the `.fit` binary parser, ascent-rate & SAC calculators, non-destructive merge logic, and Worker route handlers.
- **Web PWA (`web/tests/`):** Unit and component tests for metric/imperial conversions, i18n completeness, offline IndexedDB cache, and interactive chart calculations.

---

## 6. Living Changelog

- **Stage 1:** Configured `pre-commit`, Gitleaks, custom staging-area security & PII gate, and GitHub Actions `security-gates.yml`.
- **Stage 2:** Initialized monorepo layout (`backend/`, `web/`, `android/`, `docs/`, `fixtures/`), gitignored `local-data/` and `*.fit`, and added `deploy-cloudflare.yml`.
- **Stage 3:** Authored professional English `README.md` and `docs/TECHNICAL_DOCUMENTATION.md`.

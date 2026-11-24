-- Diving App initial D1 (SQLite) schema
-- Authorized migration file (.security/authorized-sql.txt)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dive_sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  country TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dives (
  id TEXT PRIMARY KEY,
  suunto_workout_key TEXT UNIQUE,
  fit_hash TEXT UNIQUE,
  fit_r2_key TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_s INTEGER NOT NULL,
  computer_name TEXT,
  dive_number_in_series INTEGER,
  surface_time_s INTEGER,
  max_depth_m REAL NOT NULL,
  avg_depth_m REAL,
  min_temp_c REAL,
  avg_temp_c REAL,
  water_type TEXT CHECK (water_type IN ('salt', 'fresh')),
  gas_type TEXT NOT NULL DEFAULT 'air' CHECK (gas_type IN ('air', 'nitrox', 'trimix')),
  o2_pct INTEGER NOT NULL DEFAULT 21,
  he_pct INTEGER NOT NULL DEFAULT 0,
  deco INTEGER NOT NULL DEFAULT 0 CHECK (deco IN (0, 1)),
  deco_time_s INTEGER NOT NULL DEFAULT 0,
  gf_low INTEGER,
  gf_high INTEGER,
  start_pressure_bar REAL,
  end_pressure_bar REAL,
  tank_volume_l REAL,
  tank_material TEXT CHECK (tank_material IN ('steel', 'aluminum', 'composite')),
  ballast_kg REAL,
  site_id TEXT REFERENCES dive_sites(id) ON DELETE SET NULL,
  buddy TEXT,
  dive_center TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  visibility TEXT CHECK (visibility IN ('poor', 'normal', 'good', 'excellent')),
  buoyancy TEXT CHECK (buoyancy IN ('poor', 'normal', 'good', 'excellent')),
  feeling TEXT CHECK (feeling IN ('poor', 'normal', 'good', 'excellent')),
  notes TEXT,
  user_edited_fields_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dives_started_at ON dives(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_dives_site_id ON dives(site_id);

CREATE TABLE IF NOT EXISTS dive_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dive_id TEXT NOT NULL REFERENCES dives(id) ON DELETE CASCADE,
  elapsed_s INTEGER NOT NULL,
  depth_m REAL,
  temp_c REAL,
  pressure_bar REAL,
  ascent_rate_m_min REAL
);

CREATE INDEX IF NOT EXISTS idx_dive_samples_dive_elapsed ON dive_samples(dive_id, elapsed_s);

CREATE TABLE IF NOT EXISTS gear_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand_model TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS certifications (
  id TEXT PRIMARY KEY,
  agency TEXT NOT NULL,
  level TEXT NOT NULL,
  cert_number TEXT,
  issued_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suunto_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  language TEXT NOT NULL DEFAULT 'es' CHECK (language IN ('es', 'fr')),
  unit_system TEXT NOT NULL DEFAULT 'metric' CHECK (unit_system IN ('metric', 'imperial')),
  ascent_rate_limit_m_min REAL NOT NULL DEFAULT 15.0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO user_settings (id, language, unit_system, ascent_rate_limit_m_min)
VALUES (1, 'es', 'metric', 15.0);

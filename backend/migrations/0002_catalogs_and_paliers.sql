-- Migration 0002: Reusable catalogs, multi-select gear/buddies, deco paliers, and center location
-- Authorized migration file (.security/authorized-sql.txt)

CREATE TABLE IF NOT EXISTS dive_centers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  location_text TEXT,
  latitude REAL,
  longitude REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS buddies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dive_computers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  brand TEXT,
  model TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE gear_items ADD COLUMN brand TEXT;
ALTER TABLE gear_items ADD COLUMN model TEXT;

ALTER TABLE dives ADD COLUMN deco_stops_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dives ADD COLUMN buddies_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dives ADD COLUMN gear_used_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dives ADD COLUMN dive_center_location TEXT;
ALTER TABLE dives ADD COLUMN dive_center_lat REAL;
ALTER TABLE dives ADD COLUMN dive_center_lng REAL;

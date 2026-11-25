-- Migration 0003: FFESSM Logbook Fields (log number, dive mode, tank config, pool water env, environmental conditions)
-- Non-destructive ALTER TABLE statements safe for live Cloudflare D1 production databases.

ALTER TABLE dives ADD COLUMN log_number INTEGER;
ALTER TABLE dives ADD COLUMN dive_mode TEXT;
ALTER TABLE dives ADD COLUMN tank_config TEXT;
ALTER TABLE dives ADD COLUMN water_env TEXT;
ALTER TABLE dives ADD COLUMN day_period TEXT;
ALTER TABLE dives ADD COLUMN sea_state TEXT;
ALTER TABLE dives ADD COLUMN weather TEXT;
ALTER TABLE dives ADD COLUMN current_strength TEXT;

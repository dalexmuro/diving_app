-- Migration 0005: Dedicated comfort (multi-value JSON) and mood fields
ALTER TABLE dives ADD COLUMN comfort_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dives ADD COLUMN mood TEXT;

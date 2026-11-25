-- Migration 0004: Multi-select dive types (exploration, training, night, wreck, drift, deep, cave, shore, boat, photo_bio)
ALTER TABLE dives ADD COLUMN dive_types_json TEXT NOT NULL DEFAULT '[]';

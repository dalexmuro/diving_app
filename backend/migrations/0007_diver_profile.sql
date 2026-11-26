-- Migration 0007: Diver profile & federation license metadata (with R2 PDF & QR asset keys)
CREATE TABLE IF NOT EXISTS diver_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  full_name TEXT,
  birth_date TEXT,
  federation TEXT,
  license_number TEXT,
  club_name TEXT,
  club_number TEXT,
  license_category TEXT,
  insurance TEXT,
  valid_from TEXT,
  valid_until TEXT,
  license_pdf_r2_key TEXT,
  license_pdf_filename TEXT,
  license_qr_r2_key TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO diver_profile (id) VALUES (1);

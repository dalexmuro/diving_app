-- Migration 0008: FFESSM InfoLicencie sync URL, insurance validity, medical cert (CACI) status, and last sync timestamp
ALTER TABLE diver_profile ADD COLUMN ffessm_info_url TEXT;
ALTER TABLE diver_profile ADD COLUMN insurance_valid_until TEXT;
ALTER TABLE diver_profile ADD COLUMN medical_cert_status TEXT;
ALTER TABLE diver_profile ADD COLUMN last_synced_at TEXT;

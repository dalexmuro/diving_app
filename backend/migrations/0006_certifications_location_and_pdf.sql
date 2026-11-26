-- Migration 0006: Add location and R2 PDF metadata to certifications
ALTER TABLE certifications ADD COLUMN location TEXT;
ALTER TABLE certifications ADD COLUMN pdf_r2_key TEXT;
ALTER TABLE certifications ADD COLUMN pdf_filename TEXT;

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const migrationSql =
  readFileSync(resolve(here, '../migrations/0001_init.sql'), 'utf8') +
  '\n' +
  readFileSync(resolve(here, '../migrations/0002_catalogs_and_paliers.sql'), 'utf8');

describe('D1 schema migrations (0001 + 0002)', () => {
  it('creates all expected tables and default user settings', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(migrationSql);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    expect(tables.map((t) => t.name)).toEqual([
      'buddies',
      'certifications',
      'dive_centers',
      'dive_computers',
      'dive_samples',
      'dive_sites',
      'dives',
      'gear_items',
      'suunto_tokens',
      'user_settings',
      'webauthn_credentials',
    ]);

    const settings = db
      .prepare('SELECT language, unit_system, ascent_rate_limit_m_min FROM user_settings WHERE id = 1')
      .get() as { language: string; unit_system: string; ascent_rate_limit_m_min: number };

    expect(settings).toEqual({
      language: 'es',
      unit_system: 'metric',
      ascent_rate_limit_m_min: 15,
    });
  });

  it('enforces check constraints and cascading sample deletion', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(migrationSql);

    db.prepare(
      `INSERT INTO dives (id, started_at, duration_s, max_depth_m, gas_type)
       VALUES ('dive-1', '2026-06-02T14:16:25Z', 2808, 18.06, 'air')`,
    ).run();

    db.prepare(
      `INSERT INTO dive_samples (dive_id, elapsed_s, depth_m, temp_c)
       VALUES ('dive-1', 10, 5.2, 20.0)`,
    ).run();

    expect(() =>
      db
        .prepare(
          `INSERT INTO dives (id, started_at, duration_s, max_depth_m, gas_type)
           VALUES ('dive-bad', '2026-06-02T14:16:25Z', 100, 10, 'invalid_gas')`,
        )
        .run(),
    ).toThrow();

    db.prepare("DELETE FROM dives WHERE id = 'dive-1'").run();
    const remainingSamples = db
      .prepare("SELECT COUNT(*) as cnt FROM dive_samples WHERE dive_id = 'dive-1'")
      .get() as { cnt: number };
    expect(remainingSamples.cnt).toBe(0);
  });
});

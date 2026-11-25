import { type ParsedFitDive } from '../fit/parser';
import { type TelemetrySample, calculateAverageSac, calculateDiveSac } from '../services/metrics';

export type RatingScale = 'poor' | 'normal' | 'good' | 'excellent';
export type WaterType = 'salt' | 'fresh';
export type TankMaterial = 'steel' | 'aluminum' | 'composite';
export type GasType = 'air' | 'nitrox' | 'trimix';

export interface DiveRecord {
  id: string;
  suunto_workout_key: string | null;
  fit_hash: string | null;
  fit_r2_key: string | null;
  started_at: string;
  ended_at: string | null;
  duration_s: number;
  computer_name: string | null;
  dive_number_in_series: number | null;
  surface_time_s: number | null;
  max_depth_m: number;
  avg_depth_m: number | null;
  min_temp_c: number | null;
  avg_temp_c: number | null;
  water_type: WaterType | null;
  gas_type: GasType;
  o2_pct: number;
  he_pct: number;
  deco: number;
  deco_time_s: number;
  gf_low: number | null;
  gf_high: number | null;
  start_pressure_bar: number | null;
  end_pressure_bar: number | null;
  tank_volume_l: number | null;
  tank_material: TankMaterial | null;
  ballast_kg: number | null;
  site_id: string | null;
  site_name?: string | null;
  site_latitude?: number | null;
  site_longitude?: number | null;
  site_country?: string | null;
  buddy: string | null;
  dive_center: string | null;
  tags_json: string;
  visibility: RatingScale | null;
  buoyancy: RatingScale | null;
  feeling: RatingScale | null;
  notes: string | null;
  user_edited_fields_json: string;
  created_at: string;
  updated_at: string;
}

export interface DiveDetail extends DiveRecord {
  sac_l_min: number | null;
  samples: TelemetrySample[];
}

export interface DiveSiteRecord {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  notes: string | null;
  dive_count?: number;
  max_depth_m?: number | null;
  last_dive_at?: string | null;
}

export interface GearItemRecord {
  id: string;
  name: string;
  category: string;
  brand_model: string | null;
  notes: string | null;
  created_at: string;
}

export interface CertificationRecord {
  id: string;
  agency: string;
  level: string;
  cert_number: string | null;
  issued_date: string | null;
  created_at: string;
}

export interface UserSettingsRecord {
  language: 'es' | 'fr';
  unit_system: 'metric' | 'imperial';
  ascent_rate_limit_m_min: number;
}

export interface SuuntoTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface GlobalStats {
  totalDives: number;
  totalDurationS: number;
  maxDepthM: number;
  avgDepthM: number;
  minTempC: number | null;
  maxTempC: number | null;
  avgSacLMin: number | null;
  longestDiveS: number;
  byMonth: Array<{ month: string; count: number; durationS: number }>;
  depthBuckets: Array<{ bucket: string; count: number }>;
  gasBreakdown: Array<{ gas: GasType; count: number }>;
  tempBySeason: Array<{ season: string; avgTempC: number }>;
}

const EDITABLE_DIVE_COLUMNS = [
  'started_at',
  'ended_at',
  'duration_s',
  'computer_name',
  'max_depth_m',
  'avg_depth_m',
  'min_temp_c',
  'avg_temp_c',
  'water_type',
  'gas_type',
  'o2_pct',
  'he_pct',
  'deco',
  'deco_time_s',
  'start_pressure_bar',
  'end_pressure_bar',
  'tank_volume_l',
  'tank_material',
  'ballast_kg',
  'site_id',
  'buddy',
  'dive_center',
  'tags_json',
  'visibility',
  'buoyancy',
  'feeling',
  'notes',
] as const;

export type EditableDiveField = (typeof EDITABLE_DIVE_COLUMNS)[number];
export type DivePatch = Partial<Record<EditableDiveField, unknown>> & {
  tags?: string[];
  site_name?: string;
};

function getSeasonFromIso(iso: string): 'winter' | 'spring' | 'summer' | 'autumn' {
  const m = new Date(iso).getUTCMonth() + 1;
  if (m === 12 || m <= 2) return 'winter';
  if (m <= 5) return 'spring';
  if (m <= 8) return 'summer';
  return 'autumn';
}

export function createD1Repository(db: D1Database) {
  async function findOrCreateSiteByName(name: string): Promise<string> {
    const trimmed = name.trim();
    const existing = await db
      .prepare('SELECT id FROM dive_sites WHERE LOWER(name) = LOWER(?) LIMIT 1')
      .bind(trimmed)
      .first<{ id: string }>();
    if (existing) return existing.id;

    const id = crypto.randomUUID();
    await db
      .prepare('INSERT INTO dive_sites (id, name) VALUES (?, ?)')
      .bind(id, trimmed)
      .run();
    return id;
  }

  async function insertSamples(diveId: string, samples: TelemetrySample[]): Promise<void> {
    if (samples.length === 0) return;
    const chunkSize = 80;
    for (let i = 0; i < samples.length; i += chunkSize) {
      const batch = samples.slice(i, i + chunkSize);
      const stmts = batch.map((s) =>
        db
          .prepare(
            `INSERT INTO dive_samples (dive_id, elapsed_s, depth_m, temp_c, pressure_bar, ascent_rate_m_min)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            diveId,
            s.elapsedS,
            s.depthM ?? null,
            s.tempC ?? null,
            s.pressureBar ?? null,
            s.ascentRateMMin ?? null,
          ),
      );
      await db.batch(stmts);
    }
  }

  return {
    async listDives(): Promise<DiveRecord[]> {
      const { results } = await db
        .prepare(
          `SELECT d.*,
                  s.name AS site_name,
                  s.latitude AS site_latitude,
                  s.longitude AS site_longitude,
                  s.country AS site_country
           FROM dives d
           LEFT JOIN dive_sites s ON s.id = d.site_id
           ORDER BY d.started_at DESC`,
        )
        .all<DiveRecord>();
      return results ?? [];
    },

    async getDiveById(id: string): Promise<DiveDetail | null> {
      const dive = await db
        .prepare(
          `SELECT d.*,
                  s.name AS site_name,
                  s.latitude AS site_latitude,
                  s.longitude AS site_longitude,
                  s.country AS site_country
           FROM dives d
           LEFT JOIN dive_sites s ON s.id = d.site_id
           WHERE d.id = ?`,
        )
        .bind(id)
        .first<DiveRecord>();
      if (!dive) return null;

      const { results: rawSamples } = await db
        .prepare(
          `SELECT elapsed_s, depth_m, temp_c, pressure_bar, ascent_rate_m_min
           FROM dive_samples
           WHERE dive_id = ?
           ORDER BY elapsed_s ASC`,
        )
        .bind(id)
        .all<{
          elapsed_s: number;
          depth_m: number | null;
          temp_c: number | null;
          pressure_bar: number | null;
          ascent_rate_m_min: number | null;
        }>();

      const samples: TelemetrySample[] = (rawSamples ?? []).map((r) => ({
        elapsedS: r.elapsed_s,
        depthM: r.depth_m,
        tempC: r.temp_c,
        pressureBar: r.pressure_bar,
        ascentRateMMin: r.ascent_rate_m_min,
      }));

      return {
        ...dive,
        sac_l_min: calculateDiveSac({
          startPressureBar: dive.start_pressure_bar,
          endPressureBar: dive.end_pressure_bar,
          tankVolumeL: dive.tank_volume_l,
          avgDepthM: dive.avg_depth_m,
          durationS: dive.duration_s,
        }),
        samples,
      };
    },

    async hasWorkoutKey(workoutKey: string): Promise<boolean> {
      const row = await db
        .prepare('SELECT id FROM dives WHERE suunto_workout_key = ? LIMIT 1')
        .bind(workoutKey)
        .first<{ id: string }>();
      return Boolean(row);
    },

    /**
     * Non-destructive telemetry upsert:
     * - If the dive already exists (matched by suunto_workout_key or fit_hash),
     *   it NEVER overwrites any user-edited or populated logbook field.
     */
    async upsertFromTelemetry(params: {
      parsed: ParsedFitDive;
      suuntoWorkoutKey?: string | null;
      fitR2Key?: string | null;
    }): Promise<{ diveId: string; created: boolean }> {
      const { parsed, suuntoWorkoutKey = null, fitR2Key = null } = params;

      let existing: DiveRecord | null = null;
      if (suuntoWorkoutKey) {
        existing = await db
          .prepare('SELECT * FROM dives WHERE suunto_workout_key = ? LIMIT 1')
          .bind(suuntoWorkoutKey)
          .first<DiveRecord>();
      }
      if (!existing && parsed.fitHash) {
        existing = await db
          .prepare('SELECT * FROM dives WHERE fit_hash = ? LIMIT 1')
          .bind(parsed.fitHash)
          .first<DiveRecord>();
      }

      if (existing) {
        await db
          .prepare(
            `UPDATE dives
             SET suunto_workout_key = COALESCE(suunto_workout_key, ?),
                 fit_r2_key = COALESCE(fit_r2_key, ?)
             WHERE id = ?`,
          )
          .bind(suuntoWorkoutKey, fitR2Key, existing.id)
          .run();
        return { diveId: existing.id, created: false };
      }

      const siteId = parsed.siteDescription
        ? await findOrCreateSiteByName(parsed.siteDescription)
        : null;
      const diveId = crypto.randomUUID();

      await db
        .prepare(
          `INSERT INTO dives (
            id, suunto_workout_key, fit_hash, fit_r2_key,
            started_at, ended_at, duration_s, computer_name,
            dive_number_in_series, surface_time_s,
            max_depth_m, avg_depth_m, min_temp_c, avg_temp_c,
            gas_type, o2_pct, he_pct, gf_low, gf_high,
            start_pressure_bar, end_pressure_bar, site_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          diveId,
          suuntoWorkoutKey,
          parsed.fitHash,
          fitR2Key,
          parsed.startedAt,
          parsed.endedAt,
          parsed.durationS,
          parsed.computerName,
          parsed.diveNumberInSeries,
          parsed.surfaceTimeS,
          parsed.maxDepthM,
          parsed.avgDepthM,
          parsed.minTempC,
          parsed.avgTempC,
          parsed.gasType,
          parsed.o2Pct,
          parsed.hePct,
          parsed.gfLow,
          parsed.gfHigh,
          parsed.startPressureBar,
          parsed.endPressureBar,
          siteId,
        )
        .run();

      await insertSamples(diveId, parsed.samples);
      return { diveId, created: true };
    },

    async createManualDive(patch: DivePatch): Promise<DiveDetail> {
      const id = crypto.randomUUID();
      let siteId = typeof patch.site_id === 'string' ? patch.site_id : null;
      if (!siteId && typeof patch.site_name === 'string' && patch.site_name.trim()) {
        siteId = await findOrCreateSiteByName(patch.site_name);
      }
      const startedAt =
        typeof patch.started_at === 'string' ? patch.started_at : new Date().toISOString();
      const durationS = typeof patch.duration_s === 'number' ? patch.duration_s : 0;
      const maxDepthM = typeof patch.max_depth_m === 'number' ? patch.max_depth_m : 0;

      await db
        .prepare(
          `INSERT INTO dives (id, started_at, duration_s, max_depth_m, site_id, user_edited_fields_json)
           VALUES (?, ?, ?, ?, ?, '[]')`,
        )
        .bind(id, startedAt, durationS, maxDepthM, siteId)
        .run();

      return (await this.updateDive(id, { ...patch, site_id: siteId ?? undefined }))!;
    },

    async updateDive(id: string, patch: DivePatch): Promise<DiveDetail | null> {
      const current = await db
        .prepare('SELECT * FROM dives WHERE id = ?')
        .bind(id)
        .first<DiveRecord>();
      if (!current) return null;

      const normalized: Record<string, unknown> = { ...patch };
      if (Array.isArray(patch.tags)) {
        normalized.tags_json = JSON.stringify(patch.tags);
      }
      if (typeof patch.site_name === 'string' && patch.site_name.trim() && !patch.site_id) {
        normalized.site_id = await findOrCreateSiteByName(patch.site_name);
      }

      const editedSet = new Set<string>(JSON.parse(current.user_edited_fields_json || '[]') as string[]);
      const sets: string[] = [];
      const values: unknown[] = [];

      for (const col of EDITABLE_DIVE_COLUMNS) {
        if (col in normalized && normalized[col] !== undefined) {
          sets.push(`${col} = ?`);
          values.push(normalized[col]);
          editedSet.add(col);
        }
      }

      if (sets.length > 0) {
        sets.push('user_edited_fields_json = ?');
        values.push(JSON.stringify([...editedSet]));
        sets.push("updated_at = datetime('now')");
        values.push(id);

        await db
          .prepare(`UPDATE dives SET ${sets.join(', ')} WHERE id = ?`)
          .bind(...values)
          .run();
      }

      return this.getDiveById(id);
    },

    async deleteDive(id: string): Promise<boolean> {
      const res = await db.prepare('DELETE FROM dives WHERE id = ?').bind(id).run();
      return (res.meta?.changes ?? 0) > 0;
    },

    async listSites(): Promise<DiveSiteRecord[]> {
      const { results } = await db
        .prepare(
          `SELECT s.*,
                  COUNT(d.id) AS dive_count,
                  MAX(d.max_depth_m) AS max_depth_m,
                  MAX(d.started_at) AS last_dive_at
           FROM dive_sites s
           LEFT JOIN dives d ON d.site_id = s.id
           GROUP BY s.id
           ORDER BY dive_count DESC, s.name ASC`,
        )
        .all<DiveSiteRecord>();
      return results ?? [];
    },

    async upsertSite(input: Partial<DiveSiteRecord> & { name: string }): Promise<DiveSiteRecord> {
      const id = input.id ?? crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO dive_sites (id, name, latitude, longitude, country, notes)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             latitude = excluded.latitude,
             longitude = excluded.longitude,
             country = excluded.country,
             notes = excluded.notes,
             updated_at = datetime('now')`,
        )
        .bind(
          id,
          input.name.trim(),
          input.latitude ?? null,
          input.longitude ?? null,
          input.country ?? null,
          input.notes ?? null,
        )
        .run();
      const sites = await this.listSites();
      return sites.find((s) => s.id === id)!;
    },

    async deleteSite(id: string): Promise<boolean> {
      const res = await db.prepare('DELETE FROM dive_sites WHERE id = ?').bind(id).run();
      return (res.meta?.changes ?? 0) > 0;
    },

    async listGear(): Promise<GearItemRecord[]> {
      const { results } = await db
        .prepare('SELECT * FROM gear_items ORDER BY category ASC, name ASC')
        .all<GearItemRecord>();
      return results ?? [];
    },

    async upsertGear(input: {
      id?: string;
      name: string;
      category: string;
      brand_model?: string | null;
      notes?: string | null;
    }): Promise<GearItemRecord> {
      const id = input.id ?? crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO gear_items (id, name, category, brand_model, notes)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             category = excluded.category,
             brand_model = excluded.brand_model,
             notes = excluded.notes`,
        )
        .bind(id, input.name.trim(), input.category.trim(), input.brand_model ?? null, input.notes ?? null)
        .run();
      return (await db
        .prepare('SELECT * FROM gear_items WHERE id = ?')
        .bind(id)
        .first<GearItemRecord>())!;
    },

    async deleteGear(id: string): Promise<boolean> {
      const res = await db.prepare('DELETE FROM gear_items WHERE id = ?').bind(id).run();
      return (res.meta?.changes ?? 0) > 0;
    },

    async listCertifications(): Promise<CertificationRecord[]> {
      const { results } = await db
        .prepare('SELECT * FROM certifications ORDER BY issued_date DESC, level ASC')
        .all<CertificationRecord>();
      return results ?? [];
    },

    async upsertCertification(input: {
      id?: string;
      agency: string;
      level: string;
      cert_number?: string | null;
      issued_date?: string | null;
    }): Promise<CertificationRecord> {
      const id = input.id ?? crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO certifications (id, agency, level, cert_number, issued_date)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             agency = excluded.agency,
             level = excluded.level,
             cert_number = excluded.cert_number,
             issued_date = excluded.issued_date`,
        )
        .bind(id, input.agency.trim(), input.level.trim(), input.cert_number ?? null, input.issued_date ?? null)
        .run();
      return (await db
        .prepare('SELECT * FROM certifications WHERE id = ?')
        .bind(id)
        .first<CertificationRecord>())!;
    },

    async deleteCertification(id: string): Promise<boolean> {
      const res = await db.prepare('DELETE FROM certifications WHERE id = ?').bind(id).run();
      return (res.meta?.changes ?? 0) > 0;
    },

    async getSettings(): Promise<UserSettingsRecord> {
      const row = await db
        .prepare('SELECT language, unit_system, ascent_rate_limit_m_min FROM user_settings WHERE id = 1')
        .first<UserSettingsRecord>();
      return (
        row ?? {
          language: 'es',
          unit_system: 'metric',
          ascent_rate_limit_m_min: 15,
        }
      );
    },

    async updateSettings(patch: Partial<UserSettingsRecord>): Promise<UserSettingsRecord> {
      const current = await this.getSettings();
      const next: UserSettingsRecord = {
        language: patch.language ?? current.language,
        unit_system: patch.unit_system ?? current.unit_system,
        ascent_rate_limit_m_min:
          patch.ascent_rate_limit_m_min ?? current.ascent_rate_limit_m_min,
      };
      await db
        .prepare(
          `INSERT INTO user_settings (id, language, unit_system, ascent_rate_limit_m_min, updated_at)
           VALUES (1, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             language = excluded.language,
             unit_system = excluded.unit_system,
             ascent_rate_limit_m_min = excluded.ascent_rate_limit_m_min,
             updated_at = datetime('now')`,
        )
        .bind(next.language, next.unit_system, next.ascent_rate_limit_m_min)
        .run();
      return next;
    },

    async getSuuntoTokens(): Promise<SuuntoTokenRecord | null> {
      return (
        (await db
          .prepare('SELECT access_token, refresh_token, expires_at FROM suunto_tokens WHERE id = 1')
          .first<SuuntoTokenRecord>()) ?? null
      );
    },

    async saveSuuntoTokens(tokens: SuuntoTokenRecord): Promise<void> {
      await db
        .prepare(
          `INSERT INTO suunto_tokens (id, access_token, refresh_token, expires_at, updated_at)
           VALUES (1, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             access_token = excluded.access_token,
             refresh_token = excluded.refresh_token,
             expires_at = excluded.expires_at,
             updated_at = datetime('now')`,
        )
        .bind(tokens.access_token, tokens.refresh_token, tokens.expires_at)
        .run();
    },

    async clearSuuntoTokens(): Promise<void> {
      await db.prepare('DELETE FROM suunto_tokens WHERE id = 1').run();
    },

    async getGlobalStats(): Promise<GlobalStats> {
      const dives = await this.listDives();
      if (dives.length === 0) {
        return {
          totalDives: 0,
          totalDurationS: 0,
          maxDepthM: 0,
          avgDepthM: 0,
          minTempC: null,
          maxTempC: null,
          avgSacLMin: null,
          longestDiveS: 0,
          byMonth: [],
          depthBuckets: [
            { bucket: '0-12m', count: 0 },
            { bucket: '12-18m', count: 0 },
            { bucket: '18-30m', count: 0 },
            { bucket: '30-40m', count: 0 },
            { bucket: '40m+', count: 0 },
          ],
          gasBreakdown: [],
          tempBySeason: [],
        };
      }

      const totalDurationS = dives.reduce((sum, d) => sum + d.duration_s, 0);
      const maxDepthM = Math.max(...dives.map((d) => d.max_depth_m));
      const longestDiveS = Math.max(...dives.map((d) => d.duration_s));
      const depthAvgSource = dives.map((d) => d.avg_depth_m ?? d.max_depth_m);
      const avgDepthM =
        Math.round((depthAvgSource.reduce((a, b) => a + b, 0) / dives.length) * 100) / 100;

      const minTemps = dives.map((d) => d.min_temp_c).filter((t): t is number => t !== null);
      const avgTemps = dives.map((d) => d.avg_temp_c).filter((t): t is number => t !== null);
      const allTemps = [...minTemps, ...avgTemps];

      const avgSacLMin = calculateAverageSac(
        dives.map((d) => ({
          startPressureBar: d.start_pressure_bar,
          endPressureBar: d.end_pressure_bar,
          tankVolumeL: d.tank_volume_l,
          avgDepthM: d.avg_depth_m,
          durationS: d.duration_s,
        })),
      );

      const monthMap = new Map<string, { count: number; durationS: number }>();
      const bucketCounts = { '0-12m': 0, '12-18m': 0, '18-30m': 0, '30-40m': 0, '40m+': 0 };
      const gasMap = new Map<GasType, number>();
      const seasonTemps = new Map<string, number[]>();

      for (const d of dives) {
        const ym = d.started_at.slice(0, 7);
        const curM = monthMap.get(ym) ?? { count: 0, durationS: 0 };
        curM.count += 1;
        curM.durationS += d.duration_s;
        monthMap.set(ym, curM);

        if (d.max_depth_m <= 12) bucketCounts['0-12m'] += 1;
        else if (d.max_depth_m <= 18) bucketCounts['12-18m'] += 1;
        else if (d.max_depth_m <= 30) bucketCounts['18-30m'] += 1;
        else if (d.max_depth_m <= 40) bucketCounts['30-40m'] += 1;
        else bucketCounts['40m+'] += 1;

        gasMap.set(d.gas_type, (gasMap.get(d.gas_type) ?? 0) + 1);

        const temp = d.avg_temp_c ?? d.min_temp_c;
        if (temp !== null) {
          const season = getSeasonFromIso(d.started_at);
          const list = seasonTemps.get(season) ?? [];
          list.push(temp);
          seasonTemps.set(season, list);
        }
      }

      return {
        totalDives: dives.length,
        totalDurationS,
        maxDepthM,
        avgDepthM,
        minTempC: allTemps.length > 0 ? Math.min(...allTemps) : null,
        maxTempC: allTemps.length > 0 ? Math.max(...allTemps) : null,
        avgSacLMin,
        longestDiveS,
        byMonth: [...monthMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, v]) => ({ month, ...v })),
        depthBuckets: Object.entries(bucketCounts).map(([bucket, count]) => ({ bucket, count })),
        gasBreakdown: [...gasMap.entries()].map(([gas, count]) => ({ gas, count })),
        tempBySeason: [...seasonTemps.entries()].map(([season, vals]) => ({
          season,
          avgTempC: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
        })),
      };
    },
  };
}

export type AppRepository = ReturnType<typeof createD1Repository>;

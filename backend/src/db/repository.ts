import { type ParsedFitDive } from '../fit/parser';
import { type TelemetrySample, calculateAverageSac, calculateDiveSac } from '../services/metrics';

export type RatingScale = 'poor' | 'normal' | 'good' | 'excellent';
export type WaterType = 'salt' | 'fresh' | 'pool';
export type TankMaterial = 'steel' | 'aluminum' | 'composite';
export type GasType = 'air' | 'nitrox' | 'trimix';
export type DiveMode = 'autonomous' | 'guided' | 'training';
export type TankConfig = 'single' | 'double' | 'sidemount';
export type DayPeriod = 'day' | 'twilight' | 'night';
export type SeaState = 'calm' | 'slight' | 'moderate' | 'rough';
export type WeatherCondition = 'sunny' | 'cloudy' | 'rainy' | 'windy';
export type CurrentStrength = 'none' | 'weak' | 'moderate' | 'strong';
export type DiveMood = 'relaxed' | 'focused' | 'tired' | 'stressed';

export interface DecoStop {
  depth_m: number;
  duration_min: number;
}

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
  log_number: number | null;
  dive_mode: DiveMode | null;
  dive_types_json?: string;
  water_type: WaterType | null;
  water_env?: string | null;
  gas_type: GasType;
  o2_pct: number;
  he_pct: number;
  deco: number;
  deco_time_s: number;
  deco_stops_json: string;
  gf_low: number | null;
  gf_high: number | null;
  start_pressure_bar: number | null;
  end_pressure_bar: number | null;
  tank_volume_l: number | null;
  tank_material: TankMaterial | null;
  tank_config: TankConfig | null;
  ballast_kg: number | null;
  day_period: DayPeriod | null;
  sea_state: SeaState | null;
  weather: WeatherCondition | null;
  current_strength: CurrentStrength | null;
  site_id: string | null;
  site_name?: string | null;
  site_latitude?: number | null;
  site_longitude?: number | null;
  site_country?: string | null;
  buddy: string | null;
  buddies_json: string;
  gear_used_json: string;
  dive_center: string | null;
  dive_center_location: string | null;
  dive_center_lat: number | null;
  dive_center_lng: number | null;
  tags_json: string;
  visibility: RatingScale | null;
  buoyancy: RatingScale | null;
  feeling: RatingScale | null;
  comfort_json?: string;
  mood?: DiveMood | null;
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

export interface DiveCenterRecord {
  id: string;
  name: string;
  location_text: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  created_at: string;
}

export interface BuddyRecord {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
}

export interface DiveComputerRecord {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  notes: string | null;
  created_at: string;
}

export interface GearItemRecord {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  brand_model: string | null;
  notes: string | null;
  created_at: string;
}

export interface CertificationRecord {
  id: string;
  agency: string;
  level: string;
  location: string | null;
  cert_number: string | null;
  issued_date: string | null;
  pdf_r2_key: string | null;
  pdf_filename: string | null;
  created_at: string;
}

export interface UserSettingsRecord {
  language: 'es' | 'fr';
  unit_system: 'metric' | 'imperial';
  ascent_rate_limit_m_min: number;
}

export interface DiverProfileRecord {
  full_name: string | null;
  birth_date: string | null;
  federation: string | null;
  license_number: string | null;
  club_name: string | null;
  club_number: string | null;
  license_category: string | null;
  insurance: string | null;
  insurance_valid_until: string | null;
  medical_cert_status: string | null;
  valid_from: string | null;
  valid_until: string | null;
  license_pdf_r2_key: string | null;
  license_pdf_filename: string | null;
  license_qr_r2_key: string | null;
  ffessm_info_url: string | null;
  last_synced_at: string | null;
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
  'dive_number_in_series',
  'surface_time_s',
  'max_depth_m',
  'avg_depth_m',
  'min_temp_c',
  'avg_temp_c',
  'log_number',
  'dive_mode',
  'dive_types_json',
  'water_type',
  'water_env',
  'gas_type',
  'o2_pct',
  'he_pct',
  'deco',
  'deco_time_s',
  'deco_stops_json',
  'gf_low',
  'gf_high',
  'start_pressure_bar',
  'end_pressure_bar',
  'tank_volume_l',
  'tank_material',
  'tank_config',
  'ballast_kg',
  'day_period',
  'sea_state',
  'weather',
  'current_strength',
  'site_id',
  'buddy',
  'buddies_json',
  'gear_used_json',
  'dive_center',
  'dive_center_location',
  'dive_center_lat',
  'dive_center_lng',
  'tags_json',
  'visibility',
  'buoyancy',
  'feeling',
  'comfort_json',
  'mood',
  'notes',
] as const;

export type EditableDiveField = (typeof EDITABLE_DIVE_COLUMNS)[number];
export type DivePatch = Partial<Record<EditableDiveField, unknown>> & {
  tags?: string[];
  dive_types?: string[];
  comfort?: string[];
  buddies?: string[];
  gear_used?: string[];
  deco_stops?: DecoStop[];
  site_name?: string;
  site_latitude?: number | null;
  site_longitude?: number | null;
  site_country?: string | null;
  samples?: TelemetrySample[];
  fit_hash?: string | null;
  fit_r2_key?: string | null;
};

function getSeasonFromIso(iso: string): 'winter' | 'spring' | 'summer' | 'autumn' {
  const m = new Date(iso).getUTCMonth() + 1;
  if (m === 12 || m <= 2) return 'winter';
  if (m <= 5) return 'spring';
  if (m <= 8) return 'summer';
  return 'autumn';
}

export function createD1Repository(db: D1Database) {
  async function getNextLogNumber(): Promise<number> {
    const row = await db
      .prepare('SELECT COALESCE(MAX(log_number), 0) AS max_num, COUNT(*) AS cnt FROM dives')
      .first<{ max_num: number; cnt: number }>();
    return Math.max(row?.max_num ?? 0, row?.cnt ?? 0) + 1;
  }

  async function findOrCreateSite(params: {
    name: string;
    latitude?: number | null;
    longitude?: number | null;
    country?: string | null;
  }): Promise<string> {
    const trimmed = params.name.trim();
    const existing = await db
      .prepare('SELECT id, latitude, longitude, country FROM dive_sites WHERE LOWER(name) = LOWER(?) LIMIT 1')
      .bind(trimmed)
      .first<{ id: string; latitude: number | null; longitude: number | null; country: string | null }>();
    if (existing) {
      if (params.latitude !== undefined || params.longitude !== undefined || params.country !== undefined) {
        await db
          .prepare(
            `UPDATE dive_sites
             SET latitude = COALESCE(?, latitude),
                 longitude = COALESCE(?, longitude),
                 country = COALESCE(?, country),
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(
            params.latitude ?? null,
            params.longitude ?? null,
            params.country ?? null,
            existing.id,
          )
          .run();
      }
      return existing.id;
    }

    const id = crypto.randomUUID();
    await db
      .prepare(
        'INSERT INTO dive_sites (id, name, latitude, longitude, country) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(id, trimmed, params.latitude ?? null, params.longitude ?? null, params.country ?? null)
      .run();
    return id;
  }

  async function ensureCatalogEntriesFromDive(patch: DivePatch): Promise<void> {
    if (typeof patch.computer_name === 'string' && patch.computer_name.trim()) {
      const cname = patch.computer_name.trim();
      const ex = await db
        .prepare('SELECT id FROM dive_computers WHERE LOWER(name) = LOWER(?) LIMIT 1')
        .bind(cname)
        .first<{ id: string }>();
      if (!ex) {
        await db
          .prepare('INSERT INTO dive_computers (id, name) VALUES (?, ?)')
          .bind(crypto.randomUUID(), cname)
          .run();
      }
    }

    if (typeof patch.dive_center === 'string' && patch.dive_center.trim()) {
      const centerName = patch.dive_center.trim();
      const loc =
        typeof patch.dive_center_location === 'string' && patch.dive_center_location.trim()
          ? patch.dive_center_location.trim()
          : null;
      const lat = typeof patch.dive_center_lat === 'number' ? patch.dive_center_lat : null;
      const lng = typeof patch.dive_center_lng === 'number' ? patch.dive_center_lng : null;

      const ex = await db
        .prepare('SELECT id FROM dive_centers WHERE LOWER(name) = LOWER(?) LIMIT 1')
        .bind(centerName)
        .first<{ id: string }>();
      if (!ex) {
        await db
          .prepare(
            'INSERT INTO dive_centers (id, name, location_text, latitude, longitude) VALUES (?, ?, ?, ?, ?)',
          )
          .bind(crypto.randomUUID(), centerName, loc, lat, lng)
          .run();
      } else if (loc !== null || lat !== null || lng !== null) {
        await db
          .prepare(
            `UPDATE dive_centers
             SET location_text = COALESCE(?, location_text),
                 latitude = COALESCE(?, latitude),
                 longitude = COALESCE(?, longitude)
             WHERE id = ?`,
          )
          .bind(loc, lat, lng, ex.id)
          .run();
      }
    }

    const buddyNames: string[] = [];
    if (Array.isArray(patch.buddies)) {
      buddyNames.push(...patch.buddies.map((b) => b.trim()).filter(Boolean));
    } else if (typeof patch.buddy === 'string' && patch.buddy.trim()) {
      buddyNames.push(
        ...patch.buddy
          .split(',')
          .map((b) => b.trim())
          .filter(Boolean),
      );
    }
    for (const bName of buddyNames) {
      const ex = await db
        .prepare('SELECT id FROM buddies WHERE LOWER(name) = LOWER(?) LIMIT 1')
        .bind(bName)
        .first<{ id: string }>();
      if (!ex) {
        await db
          .prepare('INSERT INTO buddies (id, name) VALUES (?, ?)')
          .bind(crypto.randomUUID(), bName)
          .run();
      }
    }

    if (Array.isArray(patch.gear_used)) {
      for (const rawGear of patch.gear_used) {
        const gName = rawGear.trim();
        if (!gName) continue;
        const ex = await db
          .prepare('SELECT id FROM gear_items WHERE LOWER(name) = LOWER(?) LIMIT 1')
          .bind(gName)
          .first<{ id: string }>();
        if (!ex) {
          await db
            .prepare('INSERT INTO gear_items (id, name, category) VALUES (?, ?, ?)')
            .bind(crypto.randomUUID(), gName, 'gear')
            .run();
        }
      }
    }
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
      return (results ?? []).map((d) => ({
        ...d,
        water_type: d.water_env === 'pool' ? 'pool' : d.water_type,
      }));
    },

    async getDiveById(id: string): Promise<DiveDetail | null> {
      const rawDive = await db
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
      if (!rawDive) return null;
      const dive: DiveRecord = {
        ...rawDive,
        water_type: rawDive.water_env === 'pool' ? 'pool' : rawDive.water_type,
      };

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
        ? await findOrCreateSite({ name: parsed.siteDescription })
        : null;
      if (parsed.computerName) {
        await ensureCatalogEntriesFromDive({ computer_name: parsed.computerName });
      }
      const diveId = crypto.randomUUID();
      const nextLogNumber = await getNextLogNumber();

      await db
        .prepare(
          `INSERT INTO dives (
            id, suunto_workout_key, fit_hash, fit_r2_key,
            started_at, ended_at, duration_s, computer_name,
            dive_number_in_series, surface_time_s, log_number,
            max_depth_m, avg_depth_m, min_temp_c, avg_temp_c,
            gas_type, o2_pct, he_pct, gf_low, gf_high,
            start_pressure_bar, end_pressure_bar, site_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          nextLogNumber,
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
      if (patch.fit_hash) {
        const dup = await db
          .prepare('SELECT id FROM dives WHERE fit_hash = ? LIMIT 1')
          .bind(patch.fit_hash)
          .first<{ id: string }>();
        if (dup) {
          return (await this.updateDive(dup.id, patch))!;
        }
      }

      const id = crypto.randomUUID();
      let siteId = typeof patch.site_id === 'string' ? patch.site_id : null;
      if (!siteId && typeof patch.site_name === 'string' && patch.site_name.trim()) {
        siteId = await findOrCreateSite({
          name: patch.site_name,
          latitude: patch.site_latitude,
          longitude: patch.site_longitude,
          country: patch.site_country,
        });
      }
      const startedAt =
        typeof patch.started_at === 'string' && patch.started_at
          ? patch.started_at
          : new Date().toISOString();
      const durationS = typeof patch.duration_s === 'number' ? patch.duration_s : 0;
      const maxDepthM = typeof patch.max_depth_m === 'number' ? patch.max_depth_m : 0;
      const assignedLogNumber =
        typeof patch.log_number === 'number' && Number.isFinite(patch.log_number)
          ? Math.round(patch.log_number)
          : await getNextLogNumber();

      await db
        .prepare(
          `INSERT INTO dives (
            id, fit_hash, fit_r2_key, started_at, duration_s, max_depth_m, log_number, site_id, user_edited_fields_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]')`,
        )
        .bind(
          id,
          patch.fit_hash ?? null,
          patch.fit_r2_key ?? null,
          startedAt,
          durationS,
          maxDepthM,
          assignedLogNumber,
          siteId,
        )
        .run();

      if (Array.isArray(patch.samples) && patch.samples.length > 0) {
        await insertSamples(id, patch.samples);
      }

      return (await this.updateDive(id, {
        ...patch,
        log_number: assignedLogNumber,
        site_id: siteId ?? undefined,
      }))!;
    },

    async updateDive(id: string, patch: DivePatch): Promise<DiveDetail | null> {
      const current = await db
        .prepare('SELECT * FROM dives WHERE id = ?')
        .bind(id)
        .first<DiveRecord>();
      if (!current) return null;

      await ensureCatalogEntriesFromDive(patch);

      const normalized: Record<string, unknown> = { ...patch };
      if (patch.water_type === 'pool') {
        normalized.water_type = 'fresh';
        normalized.water_env = 'pool';
      } else if (patch.water_type === 'salt' || patch.water_type === 'fresh' || patch.water_type === null) {
        normalized.water_env = null;
      }
      if (Array.isArray(patch.tags)) {
        normalized.tags_json = JSON.stringify(patch.tags);
      }
      if (Array.isArray(patch.dive_types)) {
        normalized.dive_types_json = JSON.stringify(
          patch.dive_types.map((v) => v.trim()).filter(Boolean),
        );
      }
      if (Array.isArray(patch.comfort)) {
        normalized.comfort_json = JSON.stringify(
          patch.comfort.map((v) => v.trim()).filter(Boolean),
        );
      }
      if (Array.isArray(patch.buddies)) {
        const cleanBuddies = patch.buddies.map((b) => b.trim()).filter(Boolean);
        normalized.buddies_json = JSON.stringify(cleanBuddies);
        normalized.buddy = cleanBuddies.length > 0 ? cleanBuddies.join(', ') : null;
      }
      if (Array.isArray(patch.gear_used)) {
        const cleanGear = patch.gear_used.map((g) => g.trim()).filter(Boolean);
        normalized.gear_used_json = JSON.stringify(cleanGear);
      }
      if (Array.isArray(patch.deco_stops)) {
        const cleanStops = patch.deco_stops.filter(
          (s) => Number.isFinite(s.depth_m) && s.depth_m > 0 && Number.isFinite(s.duration_min) && s.duration_min > 0,
        );
        normalized.deco_stops_json = JSON.stringify(cleanStops);
        normalized.deco = cleanStops.length > 0 ? 1 : 0;
        normalized.deco_time_s = Math.round(
          cleanStops.reduce((sum, s) => sum + s.duration_min, 0) * 60,
        );
      }
      if (typeof patch.site_name === 'string') {
        if (patch.site_name.trim()) {
          normalized.site_id = await findOrCreateSite({
            name: patch.site_name,
            latitude: patch.site_latitude,
            longitude: patch.site_longitude,
            country: patch.site_country,
          });
        } else {
          normalized.site_id = null;
        }
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

    // --- Sites ---
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

    // --- Dive Centers ---
    async listCenters(): Promise<DiveCenterRecord[]> {
      const { results } = await db
        .prepare('SELECT * FROM dive_centers ORDER BY name ASC')
        .all<DiveCenterRecord>();
      return results ?? [];
    },

    async upsertCenter(input: {
      id?: string;
      name: string;
      location_text?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      notes?: string | null;
    }): Promise<DiveCenterRecord> {
      const id = input.id ?? crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO dive_centers (id, name, location_text, latitude, longitude, notes)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             location_text = excluded.location_text,
             latitude = excluded.latitude,
             longitude = excluded.longitude,
             notes = excluded.notes`,
        )
        .bind(
          id,
          input.name.trim(),
          input.location_text ?? null,
          input.latitude ?? null,
          input.longitude ?? null,
          input.notes ?? null,
        )
        .run();
      return (await db
        .prepare('SELECT * FROM dive_centers WHERE id = ?')
        .bind(id)
        .first<DiveCenterRecord>())!;
    },

    async deleteCenter(id: string): Promise<boolean> {
      const res = await db.prepare('DELETE FROM dive_centers WHERE id = ?').bind(id).run();
      return (res.meta?.changes ?? 0) > 0;
    },

    // --- Buddies ---
    async listBuddies(): Promise<BuddyRecord[]> {
      const { results } = await db
        .prepare('SELECT * FROM buddies ORDER BY name ASC')
        .all<BuddyRecord>();
      return results ?? [];
    },

    async upsertBuddy(input: {
      id?: string;
      name: string;
      notes?: string | null;
    }): Promise<BuddyRecord> {
      const id = input.id ?? crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO buddies (id, name, notes)
           VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             notes = excluded.notes`,
        )
        .bind(id, input.name.trim(), input.notes ?? null)
        .run();
      return (await db
        .prepare('SELECT * FROM buddies WHERE id = ?')
        .bind(id)
        .first<BuddyRecord>())!;
    },

    async deleteBuddy(id: string): Promise<boolean> {
      const res = await db.prepare('DELETE FROM buddies WHERE id = ?').bind(id).run();
      return (res.meta?.changes ?? 0) > 0;
    },

    // --- Dive Computers ---
    async listComputers(): Promise<DiveComputerRecord[]> {
      const { results } = await db
        .prepare('SELECT * FROM dive_computers ORDER BY name ASC')
        .all<DiveComputerRecord>();
      return results ?? [];
    },

    async upsertComputer(input: {
      id?: string;
      name: string;
      brand?: string | null;
      model?: string | null;
      notes?: string | null;
    }): Promise<DiveComputerRecord> {
      const id = input.id ?? crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO dive_computers (id, name, brand, model, notes)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             brand = excluded.brand,
             model = excluded.model,
             notes = excluded.notes`,
        )
        .bind(
          id,
          input.name.trim(),
          input.brand ?? null,
          input.model ?? null,
          input.notes ?? null,
        )
        .run();
      return (await db
        .prepare('SELECT * FROM dive_computers WHERE id = ?')
        .bind(id)
        .first<DiveComputerRecord>())!;
    },

    async deleteComputer(id: string): Promise<boolean> {
      const res = await db.prepare('DELETE FROM dive_computers WHERE id = ?').bind(id).run();
      return (res.meta?.changes ?? 0) > 0;
    },

    // --- Gear (Name, Brand, Model, Notes) ---
    async listGear(): Promise<GearItemRecord[]> {
      const { results } = await db
        .prepare('SELECT * FROM gear_items ORDER BY name ASC')
        .all<GearItemRecord>();
      return results ?? [];
    },

    async upsertGear(input: {
      id?: string;
      name: string;
      category?: string;
      brand?: string | null;
      model?: string | null;
      brand_model?: string | null;
      notes?: string | null;
    }): Promise<GearItemRecord> {
      const id = input.id ?? crypto.randomUUID();
      const category = input.category?.trim() || 'gear';
      const brand = input.brand?.trim() || null;
      const model = input.model?.trim() || null;
      const combined = input.brand_model ?? ([brand, model].filter(Boolean).join(' ') || null);
      await db
        .prepare(
          `INSERT INTO gear_items (id, name, category, brand, model, brand_model, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             category = excluded.category,
             brand = excluded.brand,
             model = excluded.model,
             brand_model = excluded.brand_model,
             notes = excluded.notes`,
        )
        .bind(id, input.name.trim(), category, brand, model, combined, input.notes ?? null)
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

    // --- Certifications ---
    async listCertifications(): Promise<CertificationRecord[]> {
      const { results } = await db
        .prepare('SELECT * FROM certifications ORDER BY issued_date DESC, level ASC')
        .all<CertificationRecord>();
      return results ?? [];
    },

    async getCertificationById(id: string): Promise<CertificationRecord | null> {
      return (
        (await db
          .prepare('SELECT * FROM certifications WHERE id = ?')
          .bind(id)
          .first<CertificationRecord>()) ?? null
      );
    },

    async upsertCertification(input: {
      id?: string;
      agency: string;
      level: string;
      location?: string | null;
      cert_number?: string | null;
      issued_date?: string | null;
      pdf_r2_key?: string | null;
      pdf_filename?: string | null;
    }): Promise<CertificationRecord> {
      const id = input.id ?? crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO certifications (id, agency, level, location, cert_number, issued_date, pdf_r2_key, pdf_filename)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             agency = excluded.agency,
             level = excluded.level,
             location = excluded.location,
             cert_number = excluded.cert_number,
             issued_date = excluded.issued_date,
             pdf_r2_key = COALESCE(excluded.pdf_r2_key, certifications.pdf_r2_key),
             pdf_filename = COALESCE(excluded.pdf_filename, certifications.pdf_filename)`,
        )
        .bind(
          id,
          input.agency.trim(),
          input.level.trim(),
          input.location?.trim() || null,
          input.cert_number ?? null,
          input.issued_date ?? null,
          input.pdf_r2_key ?? null,
          input.pdf_filename ?? null,
        )
        .run();
      return (await db
        .prepare('SELECT * FROM certifications WHERE id = ?')
        .bind(id)
        .first<CertificationRecord>())!;
    },

    async setCertificationPdf(
      id: string,
      pdfR2Key: string | null,
      pdfFilename: string | null,
    ): Promise<CertificationRecord | null> {
      await db
        .prepare('UPDATE certifications SET pdf_r2_key = ?, pdf_filename = ? WHERE id = ?')
        .bind(pdfR2Key, pdfFilename, id)
        .run();
      return (
        (await db
          .prepare('SELECT * FROM certifications WHERE id = ?')
          .bind(id)
          .first<CertificationRecord>()) ?? null
      );
    },

    async deleteCertification(id: string): Promise<boolean> {
      const res = await db.prepare('DELETE FROM certifications WHERE id = ?').bind(id).run();
      return (res.meta?.changes ?? 0) > 0;
    },

    // --- Diver Profile & License ---
    async getProfile(): Promise<DiverProfileRecord> {
      const row = await db
        .prepare(
          `SELECT full_name, birth_date, federation, license_number, club_name, club_number,
                  license_category, insurance, insurance_valid_until, medical_cert_status,
                  valid_from, valid_until, license_pdf_r2_key, license_pdf_filename,
                  license_qr_r2_key, ffessm_info_url, last_synced_at
           FROM diver_profile WHERE id = 1`,
        )
        .first<DiverProfileRecord>();
      return (
        row ?? {
          full_name: null,
          birth_date: null,
          federation: null,
          license_number: null,
          club_name: null,
          club_number: null,
          license_category: null,
          insurance: null,
          insurance_valid_until: null,
          medical_cert_status: null,
          valid_from: null,
          valid_until: null,
          license_pdf_r2_key: null,
          license_pdf_filename: null,
          license_qr_r2_key: null,
          ffessm_info_url: null,
          last_synced_at: null,
        }
      );
    },

    async updateProfile(patch: Partial<DiverProfileRecord>): Promise<DiverProfileRecord> {
      const cur = await this.getProfile();
      const next: DiverProfileRecord = {
        full_name: patch.full_name !== undefined ? patch.full_name?.trim() || null : cur.full_name,
        birth_date: patch.birth_date !== undefined ? patch.birth_date?.trim() || null : cur.birth_date,
        federation: patch.federation !== undefined ? patch.federation?.trim() || null : cur.federation,
        license_number:
          patch.license_number !== undefined ? patch.license_number?.trim() || null : cur.license_number,
        club_name: patch.club_name !== undefined ? patch.club_name?.trim() || null : cur.club_name,
        club_number: patch.club_number !== undefined ? patch.club_number?.trim() || null : cur.club_number,
        license_category:
          patch.license_category !== undefined
            ? patch.license_category?.trim() || null
            : cur.license_category,
        insurance: patch.insurance !== undefined ? patch.insurance?.trim() || null : cur.insurance,
        insurance_valid_until:
          patch.insurance_valid_until !== undefined
            ? patch.insurance_valid_until?.trim() || null
            : cur.insurance_valid_until,
        medical_cert_status:
          patch.medical_cert_status !== undefined
            ? patch.medical_cert_status?.trim() || null
            : cur.medical_cert_status,
        valid_from: patch.valid_from !== undefined ? patch.valid_from?.trim() || null : cur.valid_from,
        valid_until: patch.valid_until !== undefined ? patch.valid_until?.trim() || null : cur.valid_until,
        license_pdf_r2_key:
          patch.license_pdf_r2_key !== undefined ? patch.license_pdf_r2_key : cur.license_pdf_r2_key,
        license_pdf_filename:
          patch.license_pdf_filename !== undefined ? patch.license_pdf_filename : cur.license_pdf_filename,
        license_qr_r2_key:
          patch.license_qr_r2_key !== undefined ? patch.license_qr_r2_key : cur.license_qr_r2_key,
        ffessm_info_url:
          patch.ffessm_info_url !== undefined ? patch.ffessm_info_url?.trim() || null : cur.ffessm_info_url,
        last_synced_at:
          patch.last_synced_at !== undefined ? patch.last_synced_at : cur.last_synced_at,
      };
      await db
        .prepare(
          `INSERT INTO diver_profile (
             id, full_name, birth_date, federation, license_number, club_name, club_number,
             license_category, insurance, insurance_valid_until, medical_cert_status,
             valid_from, valid_until, license_pdf_r2_key, license_pdf_filename,
             license_qr_r2_key, ffessm_info_url, last_synced_at, updated_at
           ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             full_name = excluded.full_name,
             birth_date = excluded.birth_date,
             federation = excluded.federation,
             license_number = excluded.license_number,
             club_name = excluded.club_name,
             club_number = excluded.club_number,
             license_category = excluded.license_category,
             insurance = excluded.insurance,
             insurance_valid_until = excluded.insurance_valid_until,
             medical_cert_status = excluded.medical_cert_status,
             valid_from = excluded.valid_from,
             valid_until = excluded.valid_until,
             license_pdf_r2_key = excluded.license_pdf_r2_key,
             license_pdf_filename = excluded.license_pdf_filename,
             license_qr_r2_key = excluded.license_qr_r2_key,
             ffessm_info_url = excluded.ffessm_info_url,
             last_synced_at = excluded.last_synced_at,
             updated_at = datetime('now')`,
        )
        .bind(
          next.full_name,
          next.birth_date,
          next.federation,
          next.license_number,
          next.club_name,
          next.club_number,
          next.license_category,
          next.insurance,
          next.insurance_valid_until,
          next.medical_cert_status,
          next.valid_from,
          next.valid_until,
          next.license_pdf_r2_key,
          next.license_pdf_filename,
          next.license_qr_r2_key,
          next.ffessm_info_url,
          next.last_synced_at,
        )
        .run();
      return next;
    },

    // --- Settings & Suunto ---
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
            { bucket: '12-20m', count: 0 },
            { bucket: '20-30m', count: 0 },
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
      const bucketCounts = { '0-12m': 0, '12-20m': 0, '20-30m': 0, '30-40m': 0, '40m+': 0 };
      const gasMap = new Map<GasType, number>();
      const seasonTemps = new Map<string, number[]>();

      for (const d of dives) {
        const ym = d.started_at.slice(0, 7);
        const curM = monthMap.get(ym) ?? { count: 0, durationS: 0 };
        curM.count += 1;
        curM.durationS += d.duration_s;
        monthMap.set(ym, curM);

        if (d.max_depth_m <= 12) bucketCounts['0-12m'] += 1;
        else if (d.max_depth_m <= 20) bucketCounts['12-20m'] += 1;
        else if (d.max_depth_m <= 30) bucketCounts['20-30m'] += 1;
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

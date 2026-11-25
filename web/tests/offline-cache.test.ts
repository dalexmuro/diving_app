import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { offlineCache } from '../src/offline/cacheDb';
import { type DiveDetail } from '../src/types/domain';

describe('IndexedDB offline replica cache', () => {
  it('stores and retrieves dive summaries, full telemetry curves, and user settings offline', async () => {
    expect(await offlineCache.hasCachedData()).toBe(false);

    const sampleDive: DiveDetail = {
      id: 'dive-offline-1',
      suunto_workout_key: 'wk-1',
      fit_hash: 'abc123',
      started_at: '2026-06-02T14:16:25.000Z',
      ended_at: '2026-06-02T15:03:13.000Z',
      duration_s: 2808,
      computer_name: 'Suunto Nautic',
      dive_number_in_series: 2,
      surface_time_s: 218,
      max_depth_m: 18.06,
      avg_depth_m: 9.89,
      min_temp_c: 18,
      avg_temp_c: 20,
      water_type: 'salt',
      gas_type: 'air',
      o2_pct: 21,
      he_pct: 0,
      deco: 0,
      deco_time_s: 0,
      gf_low: 40,
      gf_high: 85,
      start_pressure_bar: 200,
      end_pressure_bar: 90,
      tank_volume_l: 12,
      tank_material: 'steel',
      ballast_kg: 4,
      site_id: 'site-1',
      site_name: 'Cap Reef',
      buddy: 'Alex',
      dive_center: 'Med Dive',
      tags_json: '["reef"]',
      visibility: 'good',
      buoyancy: 'good',
      feeling: 'excellent',
      notes: 'Offline cache test',
      sac_l_min: 14.2,
      samples: [
        { elapsedS: 0, depthM: 0, tempC: 21, ascentRateMMin: null },
        { elapsedS: 60, depthM: 18.06, tempC: 18, ascentRateMMin: -18.06 },
      ],
    };

    await offlineCache.setDives([sampleDive]);
    await offlineCache.setDiveDetail(sampleDive);
    await offlineCache.setSettings({
      language: 'fr',
      unit_system: 'metric',
      ascent_rate_limit_m_min: 15,
    });

    expect(await offlineCache.hasCachedData()).toBe(true);
    const cachedDetail = await offlineCache.getDiveDetail('dive-offline-1');
    expect(cachedDetail?.samples).toHaveLength(2);
    expect(cachedDetail?.computer_name).toBe('Suunto Nautic');
    expect((await offlineCache.getSettings())?.language).toBe('fr');
  });
});

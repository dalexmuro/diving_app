import { describe, expect, it } from 'vitest';
import {
  buildProfileGeometry,
  findNearestProfilePoint,
} from '../src/charts/profileGeometry';
import { extractAvailableYears, filterDives } from '../src/services/logbookFilter';
import { type DiveSummary } from '../src/types/domain';

describe('Interactive dive profile geometry & >15 m/min red violations', () => {
  it('flags ascent segments exceeding threshold, interpolates tank pressure, and snaps click to nearest point', () => {
    const profile = buildProfileGeometry(
      [
        { elapsedS: 0, depthM: 0, tempC: 22, ascentRateMMin: null },
        { elapsedS: 30, depthM: null, tempC: 19, ascentRateMMin: null }, // 1Hz temp-only record
        { elapsedS: 60, depthM: 20, tempC: null, ascentRateMMin: -20 },
        { elapsedS: 90, depthM: 10, tempC: 20, ascentRateMMin: 20 }, // > 15 m/min violation!
        { elapsedS: 120, depthM: 5, tempC: 21, ascentRateMMin: 10 },
      ],
      15,
      200,
      100,
    );

    expect(profile.points).toHaveLength(4);
    expect(profile.violationCount).toBe(1);
    expect(profile.peakAscentRateMMin).toBe(20);
    // Temp at 30s (19°C) carried forward to 60s depth sample
    expect(profile.points[1].tempC).toBe(19);
    // Tank pressure linearly estimated at midpoint (60s / 120s) -> 150 bar
    expect(profile.points[1].pressureBar).toBe(150);
    // Segment 60s -> 90s marked red
    expect(profile.segments[1].exceedsAscentLimit).toBe(true);
    expect(profile.segments[2].exceedsAscentLimit).toBe(false);

    const snapped = findNearestProfilePoint(profile.points, 0.74);
    expect(snapped?.elapsedS).toBe(90);
    expect(snapped?.exceedsAscentLimit).toBe(true);
  });

  it('handles binary-search edge cases for empty, single, and out-of-bounds ratios', () => {
    expect(findNearestProfilePoint([], 0.5)).toBeNull();
    const single = buildProfileGeometry(
      [{ elapsedS: 0, depthM: 12, tempC: 20, ascentRateMMin: null }],
      15,
    );
    expect(findNearestProfilePoint(single.points, 0.9)?.depthM).toBe(12);

    const multi = buildProfileGeometry(
      [
        { elapsedS: 0, depthM: 0, tempC: 20, ascentRateMMin: null },
        { elapsedS: 50, depthM: 15, tempC: 20, ascentRateMMin: null },
        { elapsedS: 100, depthM: 0, tempC: 20, ascentRateMMin: null },
      ],
      15,
    );
    expect(findNearestProfilePoint(multi.points, -0.5)?.elapsedS).toBe(0);
    expect(findNearestProfilePoint(multi.points, 1.5)?.elapsedS).toBe(100);
    expect(findNearestProfilePoint(multi.points, 0.49)?.elapsedS).toBe(50);
  });
});

describe('Logbook search and multi-criteria filtering', () => {
  const sampleDives: DiveSummary[] = [
    {
      id: 'd1',
      suunto_workout_key: null,
      fit_hash: null,
      started_at: '2026-06-02T14:16:25Z',
      ended_at: null,
      duration_s: 2800,
      computer_name: 'Suunto Nautic',
      dive_number_in_series: 1,
      surface_time_s: null,
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
      site_id: 's1',
      site_name: 'Blue Wall',
      buddy: 'Claire',
      dive_center: 'Med Plongée',
      dive_mode: 'guided',
      dive_types_json: '["boat","wreck"]',
      tags_json: '["wreck","deep"]',
      visibility: 'good',
      buoyancy: 'good',
      feeling: 'excellent',
      notes: 'Clear visibility',
    },
    {
      id: 'd2',
      suunto_workout_key: null,
      fit_hash: null,
      started_at: '2025-08-14T09:00:00Z',
      ended_at: null,
      duration_s: 2100,
      computer_name: 'Suunto Nautic',
      dive_number_in_series: 1,
      surface_time_s: null,
      max_depth_m: 34,
      avg_depth_m: 20,
      min_temp_c: 16,
      avg_temp_c: 17,
      water_type: 'salt',
      gas_type: 'nitrox',
      o2_pct: 32,
      he_pct: 0,
      deco: 1,
      deco_time_s: 180,
      gf_low: 40,
      gf_high: 85,
      start_pressure_bar: 210,
      end_pressure_bar: 70,
      tank_volume_l: 15,
      tank_material: 'steel',
      ballast_kg: 5,
      site_id: 's2',
      site_name: 'North Drop',
      buddy: 'Marc',
      dive_center: 'Ocean Club',
      dive_mode: 'autonomous',
      dive_types_json: '["shore","night"]',
      tags_json: '["drift"]',
      visibility: 'excellent',
      buoyancy: 'excellent',
      feeling: 'excellent',
      notes: 'Strong current',
    },
  ];

  it('filters dives by text query, year, gas mix, and depth band', () => {
    expect(extractAvailableYears(sampleDives)).toEqual(['2026', '2025']);

    expect(
      filterDives(sampleDives, { query: 'wreck', year: 'all', gas: 'all', depthBand: 'all' }),
    ).toHaveLength(1);

    expect(
      filterDives(sampleDives, { query: '', year: '2025', gas: 'nitrox', depthBand: 'medium' }),
    ).toHaveLength(1);

    expect(
      filterDives(sampleDives, {
        query: '',
        year: 'all',
        gas: 'all',
        depthBand: 'shallow',
        mode: 'guided',
        entryType: 'boat',
        explorationType: 'wreck',
      }),
    ).toHaveLength(1);

    expect(
      filterDives(sampleDives, { query: '', year: 'all', gas: 'all', depthBand: 'deep' }),
    ).toHaveLength(0);

    expect(
      filterDives(sampleDives, { query: 'claire', year: '2025', gas: 'all', depthBand: 'all' }),
    ).toHaveLength(0);
  });
});

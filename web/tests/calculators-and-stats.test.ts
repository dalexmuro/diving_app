import { describe, expect, it } from 'vitest';
import {
  buildCumulativeHoursSeries,
  computeNitrox,
  computeSacLMin,
} from '../src/services/calculators';

describe('Offline Nitrox & SAC calculators and evolution series', () => {
  it('computes MOD, EAD, and Best Mix accurately for Nitrox', () => {
    const res = computeNitrox(32, 1.4, 30);
    expect(res).toEqual({
      modM: 33.75,
      eadM: 24.43,
      bestMixO2Pct: 35,
    });
    expect(computeNitrox(10, 1.4, 20)).toBeNull();
  });

  it('computes SAC/RMV and returns null on invalid pressure inputs', () => {
    expect(
      computeSacLMin({
        startPressureBar: 200,
        endPressureBar: 100,
        tankVolumeL: 12,
        avgDepthM: 10,
        durationMin: 40,
      }),
    ).toBe(15);

    expect(
      computeSacLMin({
        startPressureBar: 80,
        endPressureBar: 100,
        tankVolumeL: 12,
        avgDepthM: 10,
        durationMin: 40,
      }),
    ).toBeNull();
  });

  it('accumulates underwater hours monotonically across months', () => {
    const series = buildCumulativeHoursSeries([
      { month: '2026-05', count: 2, durationS: 3600 },
      { month: '2026-06', count: 3, durationS: 5400 },
    ]);
    expect(series).toEqual([
      { month: '2026-05', cumulativeHours: 1 },
      { month: '2026-06', cumulativeHours: 2.5 },
    ]);
  });
});

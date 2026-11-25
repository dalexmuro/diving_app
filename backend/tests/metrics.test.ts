import { describe, expect, it } from 'vitest';
import {
  calculateAscentRates,
  calculateAverageSac,
  calculateDiveSac,
  calculateNitroxMetrics,
  findAscentViolations,
} from '../src/services/metrics';

describe('Ascent rate calculations', () => {
  it('computes ascent rate across variable-interval depth samples and flags >15 m/min', () => {
    const samples = calculateAscentRates([
      { elapsedS: 0, depthM: 0, tempC: 21 },
      { elapsedS: 60, depthM: 18, tempC: 19 }, // descending (-18 m/min)
      { elapsedS: 90, depthM: null, tempC: 19 }, // temp-only sample
      { elapsedS: 120, depthM: 12, tempC: 20 }, // ascending 6m in 60s = 6 m/min
      { elapsedS: 150, depthM: 3, tempC: 21 }, // ascending 9m in 30s = 18 m/min (VIOLATION)
    ]);

    expect(samples[0].ascentRateMMin).toBeNull();
    expect(samples[1].ascentRateMMin).toBe(-18);
    expect(samples[2].ascentRateMMin).toBeNull();
    expect(samples[3].ascentRateMMin).toBe(6);
    expect(samples[4].ascentRateMMin).toBe(18);

    const violations = findAscentViolations(samples, 15);
    expect(violations).toHaveLength(1);
    expect(violations[0].elapsedS).toBe(150);
  });
});

describe('SAC / RMV calculations', () => {
  it('calculates SAC accurately and returns null when pressure or tank data is missing', () => {
    // 100 bar used * 12L = 1200L; avg depth 10m = 2 ATA; 40 min -> 1200 / (2 * 40) = 15 L/min
    expect(
      calculateDiveSac({
        startPressureBar: 200,
        endPressureBar: 100,
        tankVolumeL: 12,
        avgDepthM: 10,
        durationS: 2400,
      }),
    ).toBe(15);

    expect(
      calculateDiveSac({
        startPressureBar: null,
        endPressureBar: 100,
        tankVolumeL: 12,
        avgDepthM: 10,
        durationS: 2400,
      }),
    ).toBeNull();
  });

  it('excludes dives without pressure/tank data from the global SAC average', () => {
    const avg = calculateAverageSac([
      {
        startPressureBar: 200,
        endPressureBar: 100,
        tankVolumeL: 12,
        avgDepthM: 10,
        durationS: 2400, // 15 L/min
      },
      {
        startPressureBar: null,
        endPressureBar: null,
        tankVolumeL: null,
        avgDepthM: 18,
        durationS: 2800, // excluded
      },
      {
        startPressureBar: 210,
        endPressureBar: 110,
        tankVolumeL: 15,
        avgDepthM: 15, // 2.5 ATA
        durationS: 1800, // 30 min -> 1500 / 75 = 20 L/min
      },
    ]);
    expect(avg).toBe(17.5);
  });
});

describe('Nitrox calculations', () => {
  it('computes MOD, EAD, and Best Mix for EAN32 at 1.4 PPO2', () => {
    const res = calculateNitroxMetrics(32, 1.4, 30);
    expect(res.modM).toBe(33.75);
    expect(res.eadM).toBe(24.43);
    expect(res.bestMixO2Pct).toBe(35);
  });
});

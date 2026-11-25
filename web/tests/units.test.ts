import { describe, expect, it } from 'vitest';
import {
  formatAscentRate,
  formatDepth,
  formatDuration,
  formatPressure,
  formatSac,
  formatTankVolume,
  formatTemp,
  formatWeight,
} from '../src/services/units';

describe('Metric & Imperial unit conversions', () => {
  it('formats depth, pressure, temperature, weight, volume, ascent rate, and SAC in Metric', () => {
    expect(formatDepth(18.06, 'metric')).toBe('18.1 m');
    expect(formatPressure(200, 'metric')).toBe('200 bar');
    expect(formatTemp(20, 'metric')).toBe('20 °C');
    expect(formatWeight(4, 'metric')).toBe('4 kg');
    expect(formatTankVolume(12, 'metric')).toBe('12 L');
    expect(formatAscentRate(15, 'metric')).toBe('15 m/min');
    expect(formatSac(15.4, 'metric')).toBe('15.4 L/min');
  });

  it('converts accurately to Imperial units', () => {
    expect(formatDepth(10, 'imperial')).toBe('32.8 ft');
    expect(formatPressure(200, 'imperial')).toBe('2901 psi');
    expect(formatTemp(20, 'imperial')).toBe('68 °F');
    expect(formatWeight(4, 'imperial')).toBe('8.8 lb');
    expect(formatTankVolume(11.1, 'imperial')).toBe('81 cu ft');
    expect(formatAscentRate(15, 'imperial')).toBe('49.2 ft/min');
    expect(formatSac(15, 'imperial')).toBe('0.53 cu ft/min');
    expect(formatDuration(2808)).toBe('46m 48s');
    expect(formatDuration(7260)).toBe('2h 1m');
  });
});

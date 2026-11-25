import { type UnitSystem } from '../types/domain';

const METERS_TO_FEET = 3.28084;
const BAR_TO_PSI = 14.5037738;
const KG_TO_LB = 2.20462262;
// Standard scuba conversion at ~200 bar working volume equivalent (1 L water @ 200 bar ≈ 7.06 cu ft; raw geometric L -> cu ft = 0.0353147)
const LITERS_GAS_TO_CUFT = 0.0353147;

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function convertDepth(meters: number, units: UnitSystem): number {
  return units === 'imperial' ? round1(meters * METERS_TO_FEET) : round1(meters);
}

export function formatDepth(meters: number | null | undefined, units: UnitSystem): string {
  if (meters == null || !Number.isFinite(meters)) return '—';
  return units === 'imperial'
    ? `${round1(meters * METERS_TO_FEET)} ft`
    : `${round1(meters)} m`;
}

export function convertPressure(bar: number, units: UnitSystem): number {
  return units === 'imperial' ? Math.round(bar * BAR_TO_PSI) : round1(bar);
}

export function formatPressure(bar: number | null | undefined, units: UnitSystem): string {
  if (bar == null || !Number.isFinite(bar)) return '—';
  return units === 'imperial' ? `${Math.round(bar * BAR_TO_PSI)} psi` : `${round1(bar)} bar`;
}

export function convertTemp(celsius: number, units: UnitSystem): number {
  return units === 'imperial' ? round1((celsius * 9) / 5 + 32) : round1(celsius);
}

export function formatTemp(celsius: number | null | undefined, units: UnitSystem): string {
  if (celsius == null || !Number.isFinite(celsius)) return '—';
  return units === 'imperial'
    ? `${round1((celsius * 9) / 5 + 32)} °F`
    : `${round1(celsius)} °C`;
}

export function formatAscentRate(mPerMin: number | null | undefined, units: UnitSystem): string {
  if (mPerMin == null || !Number.isFinite(mPerMin)) return '—';
  return units === 'imperial'
    ? `${round1(mPerMin * METERS_TO_FEET)} ft/min`
    : `${round1(mPerMin)} m/min`;
}

export function formatWeight(kg: number | null | undefined, units: UnitSystem): string {
  if (kg == null || !Number.isFinite(kg)) return '—';
  return units === 'imperial' ? `${round1(kg * KG_TO_LB)} lb` : `${round1(kg)} kg`;
}

export function formatTankVolume(liters: number | null | undefined, units: UnitSystem): string {
  if (liters == null || !Number.isFinite(liters)) return '—';
  // Nominal free-gas capacity at 207 bar for standard imperial scuba cylinders (e.g. 11.1L -> ~80 cu ft)
  return units === 'imperial'
    ? `${Math.round(liters * 207 * LITERS_GAS_TO_CUFT)} cu ft`
    : `${round1(liters)} L`;
}

export function formatSac(lPerMin: number | null | undefined, units: UnitSystem): string {
  if (lPerMin == null || !Number.isFinite(lPerMin)) return '—';
  return units === 'imperial'
    ? `${(Math.round(lPerMin * LITERS_GAS_TO_CUFT * 100) / 100).toFixed(2)} cu ft/min`
    : `${round1(lPerMin)} L/min`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return '—';
  const totalSec = Math.round(seconds);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

export function formatElapsedMmSs(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

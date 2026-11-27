import { type TelemetrySample } from '../types/domain';

export interface PlottedProfilePoint {
  index: number;
  elapsedS: number;
  depthM: number;
  tempC: number | null;
  pressureBar: number | null;
  ascentRateMMin: number | null;
  exceedsAscentLimit: boolean;
  xRatio: number; // 0..1
  yRatio: number; // 0..1 (0 = surface 0m, 1 = maxDepth)
}

export interface ProfileSegment {
  from: PlottedProfilePoint;
  to: PlottedProfilePoint;
  exceedsAscentLimit: boolean;
}

export interface PreparedProfile {
  points: PlottedProfilePoint[];
  segments: ProfileSegment[];
  maxElapsedS: number;
  maxDepthM: number;
  violationCount: number;
  peakAscentRateMMin: number;
}

/**
 * Extracts valid depth points from raw telemetry (handling Suunto's 1Hz temperature
 * + variable-interval depth samples by carrying forward the latest temperature/pressure),
 * computes normalized SVG coordinates, and flags segments exceeding ascentLimitMMin.
 */
export function buildProfileGeometry(
  samples: TelemetrySample[],
  ascentLimitMMin = 15,
  startPressureBar?: number | null,
  endPressureBar?: number | null,
): PreparedProfile {
  let latestTemp: number | null = null;
  let latestPressure: number | null = null;

  const totalElapsed = samples.length > 0 ? Math.max(1, samples[samples.length - 1].elapsedS) : 1;
  const canInterpolatePressure =
    startPressureBar != null && endPressureBar != null && startPressureBar > endPressureBar;

  const depthRows: Array<{
    elapsedS: number;
    depthM: number;
    tempC: number | null;
    pressureBar: number | null;
    ascentRateMMin: number | null;
  }> = [];

  for (const s of samples) {
    if (s.tempC != null) latestTemp = s.tempC;
    if (s.pressureBar != null) latestPressure = s.pressureBar;
    if (s.depthM != null && Number.isFinite(s.depthM)) {
      const estPressure =
        latestPressure ??
        (canInterpolatePressure
          ? Math.round(
              (startPressureBar! -
                ((startPressureBar! - endPressureBar!) * s.elapsedS) / totalElapsed) *
                10,
            ) / 10
          : null);
      depthRows.push({
        elapsedS: s.elapsedS,
        depthM: s.depthM,
        tempC: latestTemp,
        pressureBar: estPressure,
        ascentRateMMin: s.ascentRateMMin,
      });
    }
  }

  if (depthRows.length === 0) {
    return {
      points: [],
      segments: [],
      maxElapsedS: 0,
      maxDepthM: 0,
      violationCount: 0,
      peakAscentRateMMin: 0,
    };
  }

  const maxElapsedS = Math.max(1, depthRows[depthRows.length - 1].elapsedS);
  const maxDepthM = Math.max(1, ...depthRows.map((d) => d.depthM));

  let violationCount = 0;
  let peakAscentRateMMin = 0;

  const points: PlottedProfilePoint[] = depthRows.map((r, index) => {
    const rate = r.ascentRateMMin;
    if (rate !== null && rate > peakAscentRateMMin) peakAscentRateMMin = rate;
    const exceedsAscentLimit = rate !== null && rate > ascentLimitMMin;
    if (exceedsAscentLimit) violationCount += 1;

    return {
      index,
      elapsedS: r.elapsedS,
      depthM: r.depthM,
      tempC: r.tempC,
      pressureBar: r.pressureBar,
      ascentRateMMin: rate,
      exceedsAscentLimit,
      xRatio: r.elapsedS / maxElapsedS,
      yRatio: r.depthM / maxDepthM,
    };
  });

  const segments: ProfileSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    segments.push({
      from: points[i - 1],
      to: points[i],
      exceedsAscentLimit: points[i].exceedsAscentLimit,
    });
  }

  return {
    points,
    segments,
    maxElapsedS,
    maxDepthM,
    violationCount,
    peakAscentRateMMin,
  };
}

/**
 * Finds the plotted profile point closest to a normalized horizontal click/tap position (0..1)
 * using O(log N) binary search for smooth 60fps touch scrubbing on Android.
 */
export function findNearestProfilePoint(
  points: PlottedProfilePoint[],
  targetXRatio: number,
): PlottedProfilePoint | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0];
  const clamped = Math.max(0, Math.min(1, targetXRatio));

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].xRatio < clamped) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  if (lo === 0) return points[0];
  const prev = points[lo - 1];
  const curr = points[lo];
  return Math.abs(prev.xRatio - clamped) <= Math.abs(curr.xRatio - clamped) ? prev : curr;
}

/**
 * Returns an exact linearly-interpolated point anywhere along the dive curve for a given
 * normalized xRatio (0..1), so users can click or scrub smoothly even on sparse segments
 * (including intermediate positions on red ascent-alert segments).
 */
export function interpolateProfilePoint(
  points: PlottedProfilePoint[],
  targetXRatio: number,
): PlottedProfilePoint | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0];
  const clamped = Math.max(0, Math.min(1, targetXRatio));

  if (clamped <= points[0].xRatio) return points[0];
  const last = points[points.length - 1];
  if (clamped >= last.xRatio) return last;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].xRatio < clamped) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const next = points[lo];
  const prev = points[Math.max(0, lo - 1)];
  const span = next.xRatio - prev.xRatio;
  if (span <= 0) return next;

  const alpha = (clamped - prev.xRatio) / span;
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  const lerpNullable = (a: number | null, b: number | null) =>
    a != null && b != null ? Math.round(lerp(a, b) * 10) / 10 : (b ?? a);

  return {
    index: next.index,
    elapsedS: Math.round(lerp(prev.elapsedS, next.elapsedS)),
    depthM: Math.round(lerp(prev.depthM, next.depthM) * 100) / 100,
    tempC: lerpNullable(prev.tempC, next.tempC),
    pressureBar: lerpNullable(prev.pressureBar, next.pressureBar),
    ascentRateMMin: next.ascentRateMMin,
    exceedsAscentLimit: next.exceedsAscentLimit,
    xRatio: clamped,
    yRatio: lerp(prev.yRatio, next.yRatio),
  };
}

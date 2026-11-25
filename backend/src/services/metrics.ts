export interface DepthSampleInput {
  elapsedS: number;
  depthM: number | null;
  tempC?: number | null;
  pressureBar?: number | null;
}

export interface TelemetrySample extends DepthSampleInput {
  ascentRateMMin: number | null;
}

export interface SacInput {
  startPressureBar?: number | null;
  endPressureBar?: number | null;
  tankVolumeL?: number | null;
  avgDepthM?: number | null;
  durationS?: number | null;
}

export interface NitroxResult {
  modM: number;
  eadM: number | null;
  bestMixO2Pct: number | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes instantaneous ascent rate (m/min) between consecutive valid depth samples.
 * Positive values represent ascending (depth decreasing); negative values represent descending.
 */
export function calculateAscentRates(samples: DepthSampleInput[]): TelemetrySample[] {
  let prevDepth: number | null = null;
  let prevElapsed: number | null = null;

  return samples.map((sample) => {
    let ascentRateMMin: number | null = null;
    if (sample.depthM !== null && Number.isFinite(sample.depthM)) {
      if (prevDepth !== null && prevElapsed !== null) {
        const dtSeconds = sample.elapsedS - prevElapsed;
        if (dtSeconds > 0) {
          ascentRateMMin = round2(((prevDepth - sample.depthM) / dtSeconds) * 60);
        }
      }
      prevDepth = sample.depthM;
      prevElapsed = sample.elapsedS;
    }
    return {
      ...sample,
      ascentRateMMin,
    };
  });
}

export function findAscentViolations(
  samples: TelemetrySample[],
  limitMMin = 15,
): TelemetrySample[] {
  return samples.filter(
    (s) => s.ascentRateMMin !== null && s.ascentRateMMin > limitMMin,
  );
}

/**
 * Surface Air Consumption (SAC / RMV in L/min).
 * Returns null if any required input is missing or non-positive.
 */
export function calculateDiveSac(input: SacInput): number | null {
  const { startPressureBar, endPressureBar, tankVolumeL, avgDepthM, durationS } = input;
  if (
    startPressureBar == null ||
    endPressureBar == null ||
    tankVolumeL == null ||
    avgDepthM == null ||
    durationS == null
  ) {
    return null;
  }
  const usedBar = startPressureBar - endPressureBar;
  const durationMin = durationS / 60;
  if (usedBar <= 0 || tankVolumeL <= 0 || avgDepthM < 0 || durationMin <= 0) {
    return null;
  }
  const ambientPressureAta = avgDepthM / 10 + 1;
  const sac = (usedBar * tankVolumeL) / (ambientPressureAta * durationMin);
  return round2(sac);
}

/**
 * Computes average SAC/RMV across dives, strictly excluding dives without complete pressure/tank data.
 */
export function calculateAverageSac(dives: SacInput[]): number | null {
  const validSacs = dives
    .map((d) => calculateDiveSac(d))
    .filter((v): v is number => v !== null);
  if (validSacs.length === 0) return null;
  const sum = validSacs.reduce((acc, v) => acc + v, 0);
  return round2(sum / validSacs.length);
}

/**
 * Computes Maximum Operating Depth (MOD), Equivalent Air Depth (EAD), and Best Mix (%O2).
 */
export function calculateNitroxMetrics(
  o2Pct: number,
  maxPpo2 = 1.4,
  depthM?: number,
): NitroxResult {
  if (o2Pct <= 0 || o2Pct > 100 || maxPpo2 <= 0) {
    throw new Error('Invalid Nitrox parameters');
  }
  const fo2 = o2Pct / 100;
  const modM = round2((maxPpo2 / fo2 - 1) * 10);

  let eadM: number | null = null;
  let bestMixO2Pct: number | null = null;
  if (depthM != null && depthM >= 0) {
    const fn2 = 1 - fo2;
    eadM = round2((((depthM + 10) * fn2) / 0.79) - 10);
    const ata = depthM / 10 + 1;
    bestMixO2Pct = Math.min(100, Math.floor((maxPpo2 / ata) * 100));
  }
  return { modM, eadM, bestMixO2Pct };
}

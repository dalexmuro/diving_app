export interface ClientNitroxResult {
  modM: number;
  eadM: number | null;
  bestMixO2Pct: number | null;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function computeNitrox(
  o2Pct: number,
  maxPpo2 = 1.4,
  plannedDepthM?: number | null,
): ClientNitroxResult | null {
  if (!Number.isFinite(o2Pct) || o2Pct < 18 || o2Pct > 100 || maxPpo2 <= 0) {
    return null;
  }
  const fo2 = o2Pct / 100;
  const modM = round2((maxPpo2 / fo2 - 1) * 10);

  let eadM: number | null = null;
  let bestMixO2Pct: number | null = null;
  if (plannedDepthM != null && Number.isFinite(plannedDepthM) && plannedDepthM >= 0) {
    const fn2 = 1 - fo2;
    eadM = round2((((plannedDepthM + 10) * fn2) / 0.79) - 10);
    const ata = plannedDepthM / 10 + 1;
    bestMixO2Pct = Math.min(100, Math.floor((maxPpo2 / ata) * 100));
  }
  return { modM, eadM, bestMixO2Pct };
}

export function computeSacLMin(params: {
  startPressureBar: number;
  endPressureBar: number;
  tankVolumeL: number;
  avgDepthM: number;
  durationMin: number;
}): number | null {
  const { startPressureBar, endPressureBar, tankVolumeL, avgDepthM, durationMin } = params;
  const usedBar = startPressureBar - endPressureBar;
  if (
    !Number.isFinite(usedBar) ||
    usedBar <= 0 ||
    tankVolumeL <= 0 ||
    avgDepthM < 0 ||
    durationMin <= 0
  ) {
    return null;
  }
  const ata = avgDepthM / 10 + 1;
  return round2((usedBar * tankVolumeL) / (ata * durationMin));
}

export function buildCumulativeHoursSeries(
  byMonth: Array<{ month: string; count: number; durationS: number }>,
): Array<{ month: string; cumulativeHours: number }> {
  let runningSeconds = 0;
  return byMonth.map((entry) => {
    runningSeconds += entry.durationS;
    return {
      month: entry.month,
      cumulativeHours: round2(runningSeconds / 3600),
    };
  });
}

import { useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { computeNitrox, computeSacLMin } from '../services/calculators';
import { formatDepth, formatSac } from '../services/units';

export function CalculatorsPage() {
  const { unitSystem, t } = usePreferences();

  // Nitrox state
  const [o2Pct, setO2Pct] = useState('32');
  const [maxPpo2, setMaxPpo2] = useState('1.4');
  const [plannedDepthM, setPlannedDepthM] = useState('30');

  // SAC state
  const [pStart, setPStart] = useState('200');
  const [pEnd, setPEnd] = useState('90');
  const [tankL, setTankL] = useState('12');
  const [avgDepthM, setAvgDepthM] = useState('15');
  const [durationMin, setDurationMin] = useState('45');

  const nitrox = computeNitrox(
    Number(o2Pct),
    Number(maxPpo2),
    plannedDepthM ? Number(plannedDepthM) : null,
  );

  const sac = computeSacLMin({
    startPressureBar: Number(pStart),
    endPressureBar: Number(pEnd),
    tankVolumeL: Number(tankL),
    avgDepthM: Number(avgDepthM),
    durationMin: Number(durationMin),
  });

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {t('navCalculators')}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Nitrox Calculator */}
        <div className="panel-surface p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{t('nitroxCalcTitle')}</h2>

          <div className="grid grid-cols-3 gap-3">
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('oxygenPct')}</span>
              <input
                type="number"
                min="21"
                max="100"
                value={o2Pct}
                onChange={(e) => setO2Pct(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('maxPpo2')}</span>
              <input
                type="number"
                step="0.1"
                min="1.0"
                max="1.6"
                value={maxPpo2}
                onChange={(e) => setMaxPpo2(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('plannedDepth')} (m)</span>
              <input
                type="number"
                min="0"
                max="100"
                value={plannedDepthM}
                onChange={(e) => setPlannedDepthM(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-200">
            <div>
              <p className="text-xs text-slate-500">{t('modResult')}</p>
              <p className="text-lg font-semibold tabular-telemetry text-slate-900">
                {formatDepth(nitrox?.modM ?? null, unitSystem)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t('eadResult')}</p>
              <p className="text-lg font-semibold tabular-telemetry text-slate-900">
                {formatDepth(nitrox?.eadM ?? null, unitSystem)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t('bestMixResult')}</p>
              <p className="text-lg font-semibold tabular-telemetry text-slate-900">
                {nitrox?.bestMixO2Pct != null ? `EAN${nitrox.bestMixO2Pct}` : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* SAC / RMV Calculator */}
        <div className="panel-surface p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{t('sacCalcTitle')}</h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('startPressure')} (bar)</span>
              <input
                type="number"
                value={pStart}
                onChange={(e) => setPStart(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('endPressure')} (bar)</span>
              <input
                type="number"
                value={pEnd}
                onChange={(e) => setPEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('tankVolume')} (L)</span>
              <input
                type="number"
                value={tankL}
                onChange={(e) => setTankL(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('avgDepth')} (m)</span>
              <input
                type="number"
                value={avgDepthM}
                onChange={(e) => setAvgDepthM(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('durationMin')}</span>
              <input
                type="number"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
            </label>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <p className="text-xs text-slate-500">{t('avgSac')}</p>
            <p className="text-2xl font-semibold tabular-telemetry text-slate-900">
              {formatSac(sac, unitSystem)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

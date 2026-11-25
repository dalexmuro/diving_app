import { useMemo } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { buildCumulativeHoursSeries } from '../services/calculators';
import { formatTemp } from '../services/units';
import { type GlobalStats } from '../types/domain';

interface StatsPageProps {
  stats: GlobalStats | null;
}

export function StatsPage({ stats }: StatsPageProps) {
  const { unitSystem, t } = usePreferences();

  const cumulative = useMemo(
    () => buildCumulativeHoursSeries(stats?.byMonth ?? []),
    [stats],
  );

  if (!stats || stats.totalDives === 0) {
    return (
      <section className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t('navStatistics')}
        </h1>
        <div className="panel-surface p-8 text-center text-sm text-slate-600">
          {t('noDivesYet')}
        </div>
      </section>
    );
  }

  const maxMonthlyCount = Math.max(1, ...stats.byMonth.map((m) => m.count));
  const maxCumHours = Math.max(1, ...cumulative.map((c) => c.cumulativeHours));
  const maxBucketCount = Math.max(1, ...stats.depthBuckets.map((b) => b.count));

  const seasonLabel = (season: string) => {
    switch (season) {
      case 'winter':
        return t('seasonWinter');
      case 'spring':
        return t('seasonSpring');
      case 'summer':
        return t('seasonSummer');
      default:
        return t('seasonAutumn');
    }
  };

  return (
    <section className="space-y-6">
      <h1 className="text-[clamp(1.35rem,2.5vw,1.6rem)] font-semibold tracking-tight text-slate-900">
        {t('navStatistics')}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. Dives per Month */}
        <div className="panel-surface p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{t('divesByMonth')}</h2>
          <div className="space-y-2.5">
            {stats.byMonth.map((item) => (
              <div key={item.month} className="grid grid-cols-[76px_1fr_42px] items-center gap-3 text-xs">
                <span className="text-slate-600 tabular-telemetry">{item.month}</span>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-600"
                    style={{ width: `${(item.count / maxMonthlyCount) * 100}%` }}
                  />
                </div>
                <span className="text-right font-semibold text-slate-900 tabular-telemetry">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Accumulated Underwater Hours */}
        <div className="panel-surface p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{t('accumulatedHours')}</h2>
          <div className="space-y-2.5">
            {cumulative.map((item) => (
              <div key={item.month} className="grid grid-cols-[76px_1fr_56px] items-center gap-3 text-xs">
                <span className="text-slate-600 tabular-telemetry">{item.month}</span>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-teal-600"
                    style={{ width: `${(item.cumulativeHours / maxCumHours) * 100}%` }}
                  />
                </div>
                <span className="text-right font-semibold text-slate-900 tabular-telemetry">
                  {item.cumulativeHours}h
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Depth Range Distribution */}
        <div className="panel-surface p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{t('depthDistribution')}</h2>
          <div className="space-y-2.5">
            {stats.depthBuckets.map((b) => (
              <div key={b.bucket} className="grid grid-cols-[76px_1fr_42px] items-center gap-3 text-xs">
                <span className="text-slate-600 tabular-telemetry">{b.bucket}</span>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#0b192c]"
                    style={{ width: `${(b.count / maxBucketCount) * 100}%` }}
                  />
                </div>
                <span className="text-right font-semibold text-slate-900 tabular-telemetry">
                  {b.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Seasonal Water Temperature & Gas Mix */}
        <div className="panel-surface p-5 space-y-5">
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900">{t('seasonalTemp')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {stats.tempBySeason.map((s) => (
                <div key={s.season} className="rounded-lg border border-slate-200 p-2.5">
                  <p className="text-xs text-slate-500">{seasonLabel(s.season)}</p>
                  <p className="text-sm font-semibold tabular-telemetry text-slate-900">
                    {formatTemp(s.avgTempC, unitSystem)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">{t('gasDistribution')}</h2>
            <div className="flex flex-wrap gap-2.5">
              {stats.gasBreakdown.map((g) => {
                const pct = Math.round((g.count / stats.totalDives) * 100);
                return (
                  <div
                    key={g.gas}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs flex items-center gap-2"
                  >
                    <span className="font-semibold uppercase text-slate-900">{g.gas}</span>
                    <span className="text-slate-600 tabular-telemetry">
                      {g.count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import {
  BarChart3,
  Gauge,
  Layers,
  Leaf,
  Snowflake,
  Sprout,
  Sun,
  Thermometer,
  TrendingUp,
} from 'lucide-react';
import { useMemo } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { buildCumulativeHoursSeries } from '../services/calculators';
import { formatTemp } from '../services/units';
import { type GlobalStats } from '../types/domain';

interface DashboardChartsProps {
  stats: GlobalStats;
}

function formatShortMonth(ym: string, locale: string): string {
  const [y, m] = ym.split('-');
  const yearNum = Number(y);
  const monthNum = Number(m);
  if (!yearNum || !monthNum) return ym;
  const d = new Date(Date.UTC(yearNum, monthNum - 1, 1));
  const mon = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
    .format(d)
    .replace('.', '');
  return `${mon} ${String(yearNum).slice(-2)}`;
}

const DEPTH_BAR_COLORS = [
  'from-teal-400 to-cyan-500',
  'from-sky-400 to-sky-600',
  'from-blue-600 to-indigo-700',
  'from-slate-800 to-[#0b192c]',
];

const GAS_COLORS: Record<string, string> = {
  air: '#0284c7',
  nitrox: '#14b8a6',
  trimix: '#6366f1',
};

export function DashboardCharts({ stats }: DashboardChartsProps) {
  const { unitSystem, language, t } = usePreferences();
  const locale = language === 'fr' ? 'fr-FR' : 'es-ES';

  const cumulative = useMemo(
    () => buildCumulativeHoursSeries(stats.byMonth),
    [stats.byMonth],
  );

  // 1. Vertical Bar Chart geometry (Dives per Month)
  const monthly = stats.byMonth;
  const maxMonthlyCount = Math.max(1, ...monthly.map((m) => m.count));
  const barW = 460;
  const barH = 195;
  const padL = 26;
  const padR = 14;
  const padT = 22;
  const padB = 34;
  const plotW = barW - padL - padR;
  const plotH = barH - padT - padB;
  const slotW = monthly.length > 0 ? plotW / monthly.length : plotW;
  const colW = Math.min(34, Math.max(12, slotW * 0.56));

  // 2. Smooth Area Chart geometry (Accumulated Underwater Hours)
  const maxCumHours = Math.max(1, ...cumulative.map((c) => c.cumulativeHours));
  const areaPoints = cumulative.map((item, idx) => {
    const x =
      cumulative.length === 1
        ? padL + plotW / 2
        : padL + (idx / (cumulative.length - 1)) * plotW;
    const y = padT + plotH - (item.cumulativeHours / maxCumHours) * plotH;
    return { x, y, ...item };
  });

  const linePath =
    areaPoints.length > 0
      ? areaPoints
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(' ')
      : '';
  const areaPath =
    areaPoints.length > 0
      ? `${linePath} L ${areaPoints[areaPoints.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${areaPoints[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
      : '';

  // 3. Depth buckets
  const maxBucketCount = Math.max(1, ...stats.depthBuckets.map((b) => b.count));

  // 4. Gas Donut SVG geometry
  const donutRadius = 42;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let runningOffset = 0;
  const gasSegments = stats.gasBreakdown.map((g) => {
    const ratio = stats.totalDives > 0 ? g.count / stats.totalDives : 0;
    const dashLen = ratio * donutCircumference;
    const seg = {
      ...g,
      pct: Math.round(ratio * 100),
      color: GAS_COLORS[g.gas] ?? '#64748b',
      dashArray: `${dashLen} ${donutCircumference - dashLen}`,
      dashOffset: -runningOffset,
    };
    runningOffset += dashLen;
    return seg;
  });

  const seasonMeta = (season: string) => {
    switch (season) {
      case 'winter':
        return {
          label: t('seasonWinter'),
          icon: Snowflake,
          cardClass: 'bg-sky-50/80 border-sky-200/80 text-sky-700',
        };
      case 'spring':
        return {
          label: t('seasonSpring'),
          icon: Sprout,
          cardClass: 'bg-emerald-50/80 border-emerald-200/80 text-emerald-700',
        };
      case 'summer':
        return {
          label: t('seasonSummer'),
          icon: Sun,
          cardClass: 'bg-amber-50/80 border-amber-200/80 text-amber-700',
        };
      default:
        return {
          label: t('seasonAutumn'),
          icon: Leaf,
          cardClass: 'bg-orange-50/80 border-orange-200/80 text-orange-700',
        };
    }
  };

  const gasLabel = (gas: string) => {
    if (gas === 'air') return t('gasAir');
    if (gas === 'nitrox') return t('gasNitrox');
    if (gas === 'trimix') return t('gasTrimix');
    return gas.toUpperCase();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* 1. Dives per Month — Gradient Vertical Column Chart */}
      <div className="panel-surface p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-sky-100 text-sky-700 inline-flex items-center justify-center">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />
            </span>
            <h2 className="text-base sm:text-[17px] font-bold tracking-tight text-slate-900">
              {t('divesByMonth')}
            </h2>
          </div>
          <span className="text-xs font-medium text-slate-500 tabular-telemetry">
            {stats.totalDives}{' '}
            {stats.totalDives === 1 ? t('diveCountSingular') : t('diveCountPlural')}
          </span>
        </div>

        <svg
          viewBox={`0 0 ${barW} ${barH}`}
          className="w-full h-auto overflow-visible"
          role="img"
          aria-label={t('divesByMonth')}
        >
          <defs>
            <linearGradient id="divesBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((ratio) => {
            const y = padT + plotH * (1 - ratio);
            const val = Math.round(maxMonthlyCount * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padL}
                  y1={y}
                  x2={barW - padR}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={ratio === 0 ? undefined : '3 3'}
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[9px] tabular-telemetry"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {monthly.map((item, idx) => {
            const h = Math.max(4, (item.count / maxMonthlyCount) * plotH);
            const cx = padL + slotW * idx + slotW / 2;
            const x = cx - colW / 2;
            const y = padT + plotH - h;
            return (
              <g key={item.month} className="group">
                <rect
                  x={x}
                  y={y}
                  width={colW}
                  height={h}
                  rx={6}
                  fill="url(#divesBarGrad)"
                  className="transition-opacity group-hover:opacity-85"
                />
                <text
                  x={cx}
                  y={y - 6}
                  textAnchor="middle"
                  className="fill-slate-800 text-[10px] font-semibold tabular-telemetry"
                >
                  {item.count}
                </text>
                <text
                  x={cx}
                  y={barH - 12}
                  textAnchor="middle"
                  className="fill-slate-500 text-[9px] capitalize"
                >
                  {formatShortMonth(item.month, locale)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 2. Accumulated Underwater Hours — Smooth Gradient Area Chart */}
      <div className="panel-surface p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-teal-100 text-teal-700 inline-flex items-center justify-center">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
            </span>
            <h2 className="text-base sm:text-[17px] font-bold tracking-tight text-slate-900">
              {t('accumulatedHours')}
            </h2>
          </div>
          {cumulative.length > 0 && (
            <span className="text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200/80 rounded-full px-2.5 py-0.5 tabular-telemetry">
              {cumulative[cumulative.length - 1].cumulativeHours} h
            </span>
          )}
        </div>

        <svg
          viewBox={`0 0 ${barW} ${barH}`}
          className="w-full h-auto overflow-visible"
          role="img"
          aria-label={t('accumulatedHours')}
        >
          <defs>
            <linearGradient id="hoursAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((ratio) => {
            const y = padT + plotH * (1 - ratio);
            const val = Math.round(maxCumHours * ratio * 10) / 10;
            return (
              <g key={ratio}>
                <line
                  x1={padL}
                  y1={y}
                  x2={barW - padR}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={ratio === 0 ? undefined : '3 3'}
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[9px] tabular-telemetry"
                >
                  {val}h
                </text>
              </g>
            );
          })}

          {areaPath && <path d={areaPath} fill="url(#hoursAreaGrad)" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#0d9488"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {areaPoints.map((p) => (
            <g key={p.month}>
              <circle
                cx={p.x}
                cy={p.y}
                r={4.2}
                fill="#0d9488"
                stroke="#ffffff"
                strokeWidth={2}
              />
              <text
                x={p.x}
                y={p.y - 9}
                textAnchor="middle"
                className="fill-teal-900 text-[9.5px] font-semibold tabular-telemetry"
              >
                {p.cumulativeHours}h
              </text>
              <text
                x={p.x}
                y={barH - 12}
                textAnchor="middle"
                className="fill-slate-500 text-[9px] capitalize"
              >
                {formatShortMonth(p.month, locale)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* 3. Depth Range Distribution — Ocean-Depth Color Gradient Bars */}
      <div className="panel-surface p-5 space-y-4">
        <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-200/80">
          <span className="p-1.5 rounded-lg bg-sky-100 text-sky-700 inline-flex items-center justify-center">
            <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
          </span>
          <h2 className="text-base sm:text-[17px] font-bold tracking-tight text-slate-900">
            {t('depthDistribution')}
          </h2>
        </div>
        <div className="space-y-3.5">
          {stats.depthBuckets.map((b, idx) => {
            const pct = stats.totalDives > 0 ? Math.round((b.count / stats.totalDives) * 100) : 0;
            const widthPct = b.count > 0 ? Math.max(6, (b.count / maxBucketCount) * 100) : 0;
            const grad = DEPTH_BAR_COLORS[idx] ?? DEPTH_BAR_COLORS[DEPTH_BAR_COLORS.length - 1];
            return (
              <div key={b.bucket} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 tabular-telemetry">{b.bucket}</span>
                  <span className="font-semibold text-slate-900 tabular-telemetry">
                    {b.count}{' '}
                    <span className="font-normal text-slate-400">({pct}%)</span>
                  </span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${grad} transition-all duration-500`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Seasonal Water Temperature & Gas Mix Donut */}
      <div className="panel-surface p-5 space-y-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-200/80">
            <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700 inline-flex items-center justify-center">
              <Thermometer className="w-4 h-4 sm:w-5 sm:h-5" />
            </span>
            <h2 className="text-base sm:text-[17px] font-bold tracking-tight text-slate-900">
              {t('seasonalTemp')}
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {stats.tempBySeason.map((s) => {
              const meta = seasonMeta(s.season);
              const Icon = meta.icon;
              return (
                <div
                  key={s.season}
                  className={`rounded-xl border p-3 space-y-1.5 ${meta.cardClass}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">{meta.label}</span>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                  </div>
                  <p className="text-base font-bold tabular-telemetry text-slate-900">
                    {formatTemp(s.avgTempC, unitSystem)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t border-slate-200/80">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-sky-100 text-sky-700 inline-flex items-center justify-center">
              <Gauge className="w-4 h-4 sm:w-5 sm:h-5" />
            </span>
            <h2 className="text-base sm:text-[17px] font-bold tracking-tight text-slate-900">
              {t('gasDistribution')}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative w-28 h-28 shrink-0">
              <svg
                viewBox="0 0 108 108"
                className="w-full h-full -rotate-90"
                role="img"
                aria-label={t('gasDistribution')}
              >
                <circle
                  cx="54"
                  cy="54"
                  r={donutRadius}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="14"
                />
                {gasSegments.map((seg) => (
                  <circle
                    key={seg.gas}
                    cx="54"
                    cy="54"
                    r={donutRadius}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="14"
                    strokeDasharray={seg.dashArray}
                    strokeDashoffset={seg.dashOffset}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-base font-bold text-slate-900 tabular-telemetry">
                  {stats.totalDives}
                </span>
                <span className="text-[10px] font-medium text-slate-500">
                  {stats.totalDives === 1 ? t('diveCountSingular') : t('diveCountPlural')}
                </span>
              </div>
            </div>

            <div className="flex-1 min-w-[140px] space-y-2">
              {gasSegments.map((seg) => (
                <div
                  key={seg.gas}
                  className="flex items-center justify-between gap-3 text-xs sm:text-sm"
                >
                  <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    {gasLabel(seg.gas)}
                  </span>
                  <span className="font-semibold text-slate-900 tabular-telemetry">
                    {seg.count}{' '}
                    <span className="font-normal text-slate-500">({seg.pct}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { ArrowRight, Compass, Plus } from 'lucide-react';
import { DashboardCharts } from '../components/DashboardCharts';
import { usePreferences } from '../i18n/I18nContext';
import { formatDepth, formatDuration, formatSac, formatTemp } from '../services/units';
import { type DiveSummary, type GlobalStats } from '../types/domain';

interface DashboardPageProps {
  stats: GlobalStats | null;
  dives: DiveSummary[];
  isOffline: boolean;
  onSelectDive: (diveId: string) => void;
  onStartNewDive: () => void;
}

export function DashboardPage({
  stats,
  dives,
  isOffline,
  onSelectDive,
  onStartNewDive,
}: DashboardPageProps) {
  const { unitSystem, language, t } = usePreferences();
  const latest = dives[0] ?? null;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[clamp(1.45rem,2.6vw,1.75rem)] font-bold tracking-tight text-slate-900">
          {t('navDashboard')}
        </h1>
        {!isOffline && (
          <button
            type="button"
            onClick={onStartNewDive}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-sm font-medium px-4 py-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t('newManualDive')}
          </button>
        )}
      </div>

      {/* Hero Anchor Metrics (2 primary metrics with clear typographic hierarchy) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="panel-surface p-5 border-l-4 border-l-sky-600 space-y-1">
          <p className="text-xs font-medium text-slate-500">{t('totalDives')}</p>
          <p className="text-[clamp(1.75rem,4vw,2.25rem)] font-semibold tabular-telemetry tracking-tight text-slate-900">
            {stats?.totalDives ?? dives.length}
          </p>
        </div>

        <div className="panel-surface p-5 border-l-4 border-l-[#0b192c] space-y-1">
          <p className="text-xs font-medium text-slate-500">{t('underwaterTime')}</p>
          <p className="text-[clamp(1.75rem,4vw,2.25rem)] font-semibold tabular-telemetry tracking-tight text-slate-900">
            {formatDuration(stats?.totalDurationS ?? 0)}
          </p>
        </div>
      </div>

      {/* Secondary Telemetry Metrics (fluid grid adapting to phones, foldables & desktop) */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-3.5">
        <div className="panel-surface p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">{t('maxDepth')}</p>
          <p className="text-xl font-semibold tabular-telemetry text-slate-900">
            {formatDepth(stats?.maxDepthM ?? null, unitSystem)}
          </p>
        </div>

        <div className="panel-surface p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">{t('avgDepth')}</p>
          <p className="text-xl font-semibold tabular-telemetry text-slate-900">
            {formatDepth(stats?.avgDepthM ?? null, unitSystem)}
          </p>
        </div>

        <div className="panel-surface p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">{t('avgSac')}</p>
          <p className="text-xl font-semibold tabular-telemetry text-slate-900">
            {formatSac(stats?.avgSacLMin ?? null, unitSystem)}
          </p>
        </div>

        <div className="panel-surface p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">{t('longestDive')}</p>
          <p className="text-xl font-semibold tabular-telemetry text-slate-900">
            {formatDuration(stats?.longestDiveS ?? null)}
          </p>
        </div>
      </div>

      {/* Latest Dive Highlight */}
      {latest ? (
        <div className="panel-surface p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-lg bg-sky-100 text-sky-700 inline-flex items-center justify-center">
                <Compass className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                {t('latestDive')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onSelectDive(latest.id)}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-sky-700 hover:text-sky-800 px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 transition-colors cursor-pointer"
            >
              <span>{t('diveProfile')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
            <div>
              <p className="text-xs text-slate-500">{t('siteName')}</p>
              <p className="text-sm font-semibold text-slate-900 truncate">
                {latest.site_name || '—'}
              </p>
              <p className="text-xs text-slate-500 tabular-telemetry">
                {new Date(latest.started_at).toLocaleDateString(
                  language === 'fr' ? 'fr-FR' : 'es-ES',
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t('maxDepth')}</p>
              <p className="text-sm font-semibold tabular-telemetry text-slate-900">
                {formatDepth(latest.max_depth_m, unitSystem)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t('underwaterTime')}</p>
              <p className="text-sm font-semibold tabular-telemetry text-slate-900">
                {formatDuration(latest.duration_s)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t('waterTemp')}</p>
              <p className="text-sm font-semibold tabular-telemetry text-slate-900">
                {formatTemp(latest.avg_temp_c ?? latest.min_temp_c, unitSystem)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="panel-surface p-8 text-center text-sm text-slate-600">
          {t('noDivesYet')}
        </div>
      )}

      {/* Visual Statistics Charts (merged from Statistics page) */}
      {stats && stats.totalDives > 0 && <DashboardCharts stats={stats} />}
    </section>
  );
}

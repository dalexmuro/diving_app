import { ArrowRight, Plus } from 'lucide-react';
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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t('navDashboard')}
        </h1>
        {!isOffline && (
          <button
            type="button"
            onClick={onStartNewDive}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium px-3.5 py-2 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('newManualDive')}
          </button>
        )}
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="panel-surface p-4 space-y-1">
          <p className="text-xs font-medium text-slate-600">{t('totalDives')}</p>
          <p className="text-2xl font-semibold tabular-telemetry text-slate-900">
            {stats?.totalDives ?? dives.length}
          </p>
        </div>

        <div className="panel-surface p-4 space-y-1">
          <p className="text-xs font-medium text-slate-600">{t('underwaterTime')}</p>
          <p className="text-2xl font-semibold tabular-telemetry text-slate-900">
            {formatDuration(stats?.totalDurationS ?? 0)}
          </p>
        </div>

        <div className="panel-surface p-4 space-y-1">
          <p className="text-xs font-medium text-slate-600">{t('maxDepth')}</p>
          <p className="text-2xl font-semibold tabular-telemetry text-slate-900">
            {formatDepth(stats?.maxDepthM ?? null, unitSystem)}
          </p>
        </div>

        <div className="panel-surface p-4 space-y-1">
          <p className="text-xs font-medium text-slate-600">{t('avgDepth')}</p>
          <p className="text-2xl font-semibold tabular-telemetry text-slate-900">
            {formatDepth(stats?.avgDepthM ?? null, unitSystem)}
          </p>
        </div>

        <div className="panel-surface p-4 space-y-1">
          <p className="text-xs font-medium text-slate-600">{t('avgSac')}</p>
          <p className="text-2xl font-semibold tabular-telemetry text-slate-900">
            {formatSac(stats?.avgSacLMin ?? null, unitSystem)}
          </p>
        </div>

        <div className="panel-surface p-4 space-y-1">
          <p className="text-xs font-medium text-slate-600">{t('longestDive')}</p>
          <p className="text-2xl font-semibold tabular-telemetry text-slate-900">
            {formatDuration(stats?.longestDiveS ?? null)}
          </p>
        </div>
      </div>

      {/* Latest Dive Highlight */}
      {latest ? (
        <div className="panel-surface p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">{t('latestDive')}</h2>
            <button
              type="button"
              onClick={() => onSelectDive(latest.id)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-800 cursor-pointer"
            >
              <span>{t('diveProfile')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
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
    </section>
  );
}

import { ChevronRight, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import {
  type DepthBandFilter,
  extractAvailableYears,
  filterDives,
} from '../services/logbookFilter';
import { formatDepth, formatDuration, formatTemp } from '../services/units';
import { type DiveSummary, type GasType } from '../types/domain';

interface LogbookPageProps {
  dives: DiveSummary[];
  isOffline: boolean;
  onSelectDive: (diveId: string) => void;
  onCreateManualDive: () => Promise<void>;
}

export function LogbookPage({
  dives,
  isOffline,
  onSelectDive,
  onCreateManualDive,
}: LogbookPageProps) {
  const { unitSystem, t, language } = usePreferences();
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('all');
  const [gas, setGas] = useState<'all' | GasType>('all');
  const [depthBand, setDepthBand] = useState<DepthBandFilter>('all');

  const years = useMemo(() => extractAvailableYears(dives), [dives]);
  const filtered = useMemo(
    () => filterDives(dives, { query, year, gas, depthBand }),
    [dives, query, year, gas, depthBand],
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t('navLogbook')}
        </h1>
        {!isOffline && (
          <button
            type="button"
            onClick={() => void onCreateManualDive()}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-3.5 py-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t('newManualDive')}
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="panel-surface p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
          />
        </div>

        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          aria-label={t('allYears')}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
        >
          <option value="all">{t('allYears')}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <select
          value={gas}
          onChange={(e) => setGas(e.target.value as 'all' | GasType)}
          aria-label={t('allGases')}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
        >
          <option value="all">{t('allGases')}</option>
          <option value="air">{t('gasAir')}</option>
          <option value="nitrox">{t('gasNitrox')}</option>
          <option value="trimix">{t('gasTrimix')}</option>
        </select>

        <select
          value={depthBand}
          onChange={(e) => setDepthBand(e.target.value as DepthBandFilter)}
          aria-label={t('depth')}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
        >
          <option value="all">{t('depth')}: All</option>
          <option value="shallow">≤ 18 m</option>
          <option value="medium">18 – 30 m</option>
          <option value="deep">&gt; 30 m</option>
        </select>
      </div>

      {/* Dive List */}
      {filtered.length === 0 ? (
        <div className="panel-surface p-8 text-center text-sm text-slate-600">
          {t('noDivesYet')}
        </div>
      ) : (
        <div className="panel-surface divide-y divide-slate-200 overflow-hidden">
          {filtered.map((dive) => {
            const dateStr = new Date(dive.started_at).toLocaleDateString(
              language === 'fr' ? 'fr-FR' : 'es-ES',
              { year: 'numeric', month: 'short', day: '2-digit' },
            );
            const timeStr = new Date(dive.started_at).toLocaleTimeString(
              language === 'fr' ? 'fr-FR' : 'es-ES',
              { hour: '2-digit', minute: '2-digit' },
            );
            return (
              <button
                key={dive.id}
                type="button"
                onClick={() => onSelectDive(dive.id)}
                className="w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-sm text-slate-900 truncate">
                      {dive.site_name || '—'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 uppercase">
                      {dive.gas_type} {dive.o2_pct}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 tabular-telemetry">
                    {dateStr} · {timeStr}
                    {dive.computer_name ? ` · ${dive.computer_name}` : ''}
                    {dive.buddy ? ` · ${dive.buddy}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-5 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 tabular-telemetry">
                      {formatDepth(dive.max_depth_m, unitSystem)}
                    </p>
                    <p className="text-xs text-slate-500 tabular-telemetry">
                      {formatDuration(dive.duration_s)} ·{' '}
                      {formatTemp(dive.avg_temp_c ?? dive.min_temp_c, unitSystem)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

import { ChevronRight, Plus, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
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
  onStartNewDive: () => void;
}

export function LogbookPage({
  dives,
  isOffline,
  onSelectDive,
  onStartNewDive,
}: LogbookPageProps) {
  const { unitSystem, t, language } = usePreferences();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [year, setYear] = useState('all');
  const [gas, setGas] = useState<'all' | GasType>('all');
  const [depthBand, setDepthBand] = useState<DepthBandFilter>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const years = useMemo(() => extractAvailableYears(dives), [dives]);
  const filtered = useMemo(
    () => filterDives(dives, { query: deferredQuery, year, gas, depthBand }),
    [dives, deferredQuery, year, gas, depthBand],
  );

  // Cache Intl.DateTimeFormat instances per language (avoids 2 allocations per dive row per render)
  const formatters = useMemo(() => {
    const locale = language === 'fr' ? 'fr-FR' : 'es-ES';
    return {
      date: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: '2-digit' }),
      time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    };
  }, [language]);

  const activeFilterCount =
    (year !== 'all' ? 1 : 0) + (gas !== 'all' ? 1 : 0) + (depthBand !== 'all' ? 1 : 0);
  const hasAnyFilter = activeFilterCount > 0 || query.trim().length > 0;

  function clearAllFilters() {
    setQuery('');
    setYear('all');
    setGas('all');
    setDepthBand('all');
  }

  return (
    <section className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[clamp(1.35rem,2.5vw,1.6rem)] font-semibold tracking-tight text-slate-900">
          {t('navLogbook')}
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

      {/* Search & Filters (compact collapsible drawer on mobile so dives stay above the fold) */}
      <div className="panel-surface p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
            />
          </div>

          <button
            type="button"
            aria-expanded={mobileFiltersOpen}
            onClick={() => setMobileFiltersOpen((prev) => !prev)}
            className={`sm:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer shrink-0 ${
              activeFilterCount > 0 || mobileFiltersOpen
                ? 'border-sky-300 bg-sky-50 text-sky-800'
                : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{t('filtersToggle')}</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-sky-600 text-white text-[10px] tabular-telemetry">
                {activeFilterCount}
              </span>
            )}
          </button>

          {hasAnyFilter && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('clearFilters')}</span>
            </button>
          )}
        </div>

        <div
          className={`${
            mobileFiltersOpen ? 'grid' : 'hidden sm:grid'
          } grid-cols-1 sm:grid-cols-3 gap-2.5`}
        >
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
            <option value="all">{t('depthAll')}</option>
            <option value="shallow">≤ 18 m</option>
            <option value="medium">18 – 30 m</option>
            <option value="deep">&gt; 30 m</option>
          </select>

          {hasAnyFilter && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="sm:hidden inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('clearFilters')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Dive List */}
      {filtered.length === 0 ? (
        <div className="panel-surface p-8 text-center space-y-3">
          <p className="text-sm text-slate-600">
            {hasAnyFilter ? t('noMatchingDives') : t('noDivesYet')}
          </p>
          {hasAnyFilter && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('clearFilters')}
            </button>
          )}
        </div>
      ) : (
        <div className="panel-surface divide-y divide-slate-200 overflow-hidden">
          {filtered.map((dive) => {
            const d = new Date(dive.started_at);
            const dateStr = formatters.date.format(d);
            const timeStr = formatters.time.format(d);
            return (
              <button
                key={dive.id}
                type="button"
                onClick={() => onSelectDive(dive.id)}
                className="logbook-row w-full text-left px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100/80 transition-colors flex items-center justify-between gap-3 sm:gap-4 cursor-pointer"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900 truncate">
                      {dive.site_name || '—'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 uppercase shrink-0">
                      {dive.gas_type} {dive.o2_pct}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 tabular-telemetry truncate">
                    {dateStr} · {timeStr}
                    {dive.computer_name ? ` · ${dive.computer_name}` : ''}
                    {dive.buddy ? ` · ${dive.buddy}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-3 sm:gap-5 shrink-0">
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

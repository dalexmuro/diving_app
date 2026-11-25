import { ArrowRight, Compass, Plus, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import {
  type DepthBandFilter,
  type EntryTypeFilter,
  extractAvailableYears,
  extractCustomExplorationTypes,
  filterDives,
} from '../services/logbookFilter';
import { formatDepth, formatDuration } from '../services/units';
import { type DiveMode, type DiveSummary, type GasType } from '../types/domain';

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
  const [mode, setMode] = useState<'all' | DiveMode>('all');
  const [entryType, setEntryType] = useState<EntryTypeFilter>('all');
  const [explorationType, setExplorationType] = useState<'all' | string>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const years = useMemo(() => extractAvailableYears(dives), [dives]);
  const customExplorationTypes = useMemo(() => extractCustomExplorationTypes(dives), [dives]);
  const filtered = useMemo(
    () =>
      filterDives(dives, {
        query: deferredQuery,
        year,
        gas,
        depthBand,
        mode,
        entryType,
        explorationType,
      }),
    [dives, deferredQuery, year, gas, depthBand, mode, entryType, explorationType],
  );

  // Cache Intl.DateTimeFormat instances per language
  const formatters = useMemo(() => {
    const locale = language === 'fr' ? 'fr-FR' : 'es-ES';
    return {
      date: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }),
      time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    };
  }, [language]);

  const activeFilterCount =
    (year !== 'all' ? 1 : 0) +
    (gas !== 'all' ? 1 : 0) +
    (depthBand !== 'all' ? 1 : 0) +
    (mode !== 'all' ? 1 : 0) +
    (entryType !== 'all' ? 1 : 0) +
    (explorationType !== 'all' ? 1 : 0);
  const hasAnyFilter = activeFilterCount > 0 || query.trim().length > 0;

  function clearAllFilters() {
    setQuery('');
    setYear('all');
    setGas('all');
    setDepthBand('all');
    setMode('all');
    setEntryType('all');
    setExplorationType('all');
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[clamp(1.35rem,2.5vw,1.6rem)] font-semibold tracking-tight text-slate-900">
            {t('navLogbook')}
          </h1>
          <span className="text-xs sm:text-sm font-medium text-slate-500 tabular-telemetry">
            {filtered.length}{' '}
            {filtered.length === 1 ? t('diveCountSingular') : t('diveCountPlural')}
          </span>
        </div>
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

      {/* Search & Collapsible Multi-Filter Panel */}
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
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs sm:text-sm font-medium transition-colors cursor-pointer shrink-0 ${
              activeFilterCount > 0 || filtersOpen
                ? 'border-sky-300 bg-sky-50 text-sky-800'
                : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>{t('filterBtn')}</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-sky-600 text-white text-[10px] font-semibold tabular-telemetry">
                {activeFilterCount}
              </span>
            )}
          </button>

          {hasAnyFilter && (
            <button
              type="button"
              onClick={clearAllFilters}
              title={t('clearFilters')}
              aria-label={t('clearFilters')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('clearFilters')}</span>
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-slate-200/80">
            <label className="space-y-1 text-xs font-medium text-slate-600">
              <span>{t('depth')}</span>
              <select
                value={depthBand}
                onChange={(e) => setDepthBand(e.target.value as DepthBandFilter)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
              >
                <option value="all">{t('depthAll')}</option>
                <option value="shallow">≤ 20 m</option>
                <option value="medium">20 – 40 m</option>
                <option value="deep">&gt; 40 m</option>
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium text-slate-600">
              <span>{t('diveMode')}</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'all' | DiveMode)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
              >
                <option value="all">{t('allModes')}</option>
                <option value="guided">{t('modeGuided')}</option>
                <option value="autonomous">{t('modeAutonomous')}</option>
                <option value="training">{t('modeTraining')}</option>
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium text-slate-600">
              <span>{t('diveEntryTitle')}</span>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value as EntryTypeFilter)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
              >
                <option value="all">{t('allEntries')}</option>
                <option value="shore">{t('diveTypeShore')}</option>
                <option value="boat">{t('diveTypeBoat')}</option>
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium text-slate-600">
              <span>{t('diveTypesTitle')}</span>
              <select
                value={explorationType}
                onChange={(e) => setExplorationType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
              >
                <option value="all">{t('allExplorationTypes')}</option>
                <option value="cave">{t('diveTypeCave')}</option>
                <option value="wreck">{t('diveTypeWreck')}</option>
                <option value="photo_bio">{t('diveTypePhotoBio')}</option>
                <option value="night">{t('diveTypeNight')}</option>
                {customExplorationTypes.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium text-slate-600">
              <span>{t('allYears')}</span>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
              >
                <option value="all">{t('allYears')}</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium text-slate-600">
              <span>{t('allGases')}</span>
              <select
                value={gas}
                onChange={(e) => setGas(e.target.value as 'all' | GasType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
              >
                <option value="all">{t('allGases')}</option>
                <option value="air">{t('gasAir')}</option>
                <option value="nitrox">{t('gasNitrox')}</option>
                <option value="trimix">{t('gasTrimix')}</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {/* FFESSM-Inspired Airy Dive Cards */}
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
        <div className="space-y-3.5 sm:space-y-4">
          {filtered.map((dive) => {
            const d = new Date(dive.started_at);
            const dateStr = formatters.date.format(d);
            const timeStr = formatters.time.format(d);
            return (
              <button
                key={dive.id}
                type="button"
                aria-label={`${t('openDiveAria')} ${dive.site_name || ''}`.trim()}
                onClick={() => onSelectDive(dive.id)}
                className="logbook-row group w-full text-left rounded-2xl border border-slate-200/90 bg-white px-5 py-4 sm:px-6 sm:py-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] hover:shadow-md hover:border-sky-300/80 active:bg-slate-50/70 transition-all flex items-center justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-start gap-4 min-w-0">
                  <div className="hidden sm:flex w-10 h-10 rounded-full bg-[#0b192c] text-white items-center justify-center shrink-0 mt-0.5">
                    <Compass className="w-5 h-5 text-sky-300" />
                  </div>

                  <div className="min-w-0 space-y-2">
                    {dive.log_number != null && (
                      <p className="text-xs font-medium text-slate-500 tabular-telemetry">
                        N° {dive.log_number}
                      </p>
                    )}

                    <h2 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug truncate">
                      {dive.site_name || '—'}
                    </h2>

                    <div className="inline-flex items-center rounded-md bg-sky-100/85 px-2.5 py-1 text-xs sm:text-[13px] font-medium text-sky-950 tabular-telemetry">
                      {dateStr} · {timeStr}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:text-sm text-slate-700 tabular-telemetry pt-0.5">
                      <span>
                        <span className="text-slate-500">{t('totalDiveTime')}: </span>
                        <span className="font-semibold text-slate-900">
                          {formatDuration(dive.duration_s)}
                        </span>
                      </span>
                      <span>
                        <span className="text-slate-500">{t('maxDepth')}: </span>
                        <span className="font-semibold text-slate-900">
                          {formatDepth(dive.max_depth_m, unitSystem)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <span
                  aria-hidden="true"
                  className="w-10 h-10 rounded-xl bg-teal-400/90 group-hover:bg-teal-400 group-hover:translate-x-0.5 text-slate-900 flex items-center justify-center shadow-xs transition-all shrink-0"
                >
                  <ArrowRight className="w-4 h-4" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

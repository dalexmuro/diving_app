import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { PreferencesContext } from './i18n/I18nContext';
import { TRANSLATIONS, type TranslationKey } from './i18n/translations';
import { offlineCache } from './offline/cacheDb';
import { apiClient } from './services/api';
import { formatDepth, formatDuration, formatSac } from './services/units';
import {
  type AppView,
  type DiveSummary,
  type GlobalStats,
  type Language,
  type UnitSystem,
} from './types/domain';

export function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [offlineBrowse, setOfflineBrowse] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [hasCachedData, setHasCachedData] = useState(false);

  const [language, setLanguage] = useState<Language>('es');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [ascentLimitMMin, setAscentLimitMMin] = useState(15);

  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [isOffline, setIsOffline] = useState(false);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [dives, setDives] = useState<DiveSummary[]>([]);

  const loadInitialData = useCallback(async () => {
    const [settings, divesRes, statsRes] = await Promise.all([
      apiClient.fetchSettings(),
      apiClient.fetchDives(),
      apiClient.fetchStats(),
    ]);
    setLanguage(settings.language);
    setUnitSystem(settings.unit_system);
    setAscentLimitMMin(settings.ascent_rate_limit_m_min);
    setDives(divesRes.data);
    setStats(statsRes.data);
    setIsOffline(divesRes.offline || statsRes.offline);
  }, []);

  useEffect(() => {
    void (async () => {
      const [session, cached] = await Promise.all([
        apiClient.checkSession(),
        offlineCache.hasCachedData(),
      ]);
      setHasCachedData(cached);
      if (session.authenticated) {
        setAuthenticated(true);
        setUserEmail(session.email);
        await loadInitialData();
      } else {
        const cachedSettings = await offlineCache.getSettings();
        if (cachedSettings) {
          setLanguage(cachedSettings.language);
          setUnitSystem(cachedSettings.unit_system);
          setAscentLimitMMin(cachedSettings.ascent_rate_limit_m_min);
        }
      }
      setAuthChecked(true);
    })();
  }, [loadInitialData]);

  const setPreferences = useCallback(
    async (patch: { language?: Language; unitSystem?: UnitSystem; ascentLimitMMin?: number }) => {
      const updated = await apiClient.updateSettings({
        language: patch.language,
        unit_system: patch.unitSystem,
        ascent_rate_limit_m_min: patch.ascentLimitMMin,
      });
      setLanguage(updated.language);
      setUnitSystem(updated.unit_system);
      setAscentLimitMMin(updated.ascent_rate_limit_m_min);
    },
    [],
  );

  const prefsValue = useMemo(
    () => ({
      language,
      unitSystem,
      ascentLimitMMin,
      t: (key: TranslationKey) => TRANSLATIONS[language][key],
      setPreferences,
    }),
    [language, unitSystem, ascentLimitMMin, setPreferences],
  );

  if (!authChecked) {
    return (
      <div className="min-h-dvh bg-[#0b192c] flex items-center justify-center">
        <div className="w-48 h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="w-1/2 h-full bg-sky-500 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!authenticated && !offlineBrowse) {
    return (
      <PreferencesContext.Provider value={prefsValue}>
        <AuthGate
          hasCachedData={hasCachedData}
          onAuthenticated={() => {
            setAuthenticated(true);
            void loadInitialData();
          }}
          onEnterOfflineMode={() => {
            setOfflineBrowse(true);
            setIsOffline(true);
            void loadInitialData();
          }}
        />
      </PreferencesContext.Provider>
    );
  }

  return (
    <PreferencesContext.Provider value={prefsValue}>
      <AppShell
        activeView={activeView}
        isOffline={isOffline}
        userEmail={userEmail}
        onNavigate={setActiveView}
        onSignOut={() => {
          void apiClient.logout().finally(() => {
            setAuthenticated(false);
            setOfflineBrowse(false);
          });
        }}
      >
        <section className="space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {prefsValue.t(
              activeView === 'logbook' || activeView === 'dive-detail'
                ? 'navLogbook'
                : activeView === 'statistics'
                  ? 'navStatistics'
                  : activeView === 'sites'
                    ? 'navSites'
                    : activeView === 'gear-certs'
                      ? 'navGearCerts'
                      : activeView === 'calculators'
                        ? 'navCalculators'
                        : activeView === 'settings'
                          ? 'navSettings'
                          : 'navDashboard',
            )}
          </h1>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="panel-surface p-4 space-y-1">
              <p className="text-xs font-medium text-slate-600">{prefsValue.t('totalDives')}</p>
              <p className="text-2xl font-semibold tabular-telemetry text-slate-900">
                {stats?.totalDives ?? dives.length}
              </p>
            </div>
            <div className="panel-surface p-4 space-y-1">
              <p className="text-xs font-medium text-slate-600">{prefsValue.t('underwaterTime')}</p>
              <p className="text-2xl font-semibold tabular-telemetry text-slate-900">
                {formatDuration(stats?.totalDurationS ?? 0)}
              </p>
            </div>
            <div className="panel-surface p-4 space-y-1">
              <p className="text-xs font-medium text-slate-600">{prefsValue.t('maxDepth')}</p>
              <p className="text-2xl font-semibold tabular-telemetry text-slate-900">
                {formatDepth(stats?.maxDepthM ?? null, unitSystem)}
              </p>
            </div>
            <div className="panel-surface p-4 space-y-1">
              <p className="text-xs font-medium text-slate-600">{prefsValue.t('avgSac')}</p>
              <p className="text-2xl font-semibold tabular-telemetry text-slate-900">
                {formatSac(stats?.avgSacLMin ?? null, unitSystem)}
              </p>
            </div>
          </div>
        </section>
      </AppShell>
    </PreferencesContext.Provider>
  );
}

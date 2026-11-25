import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { PreferencesContext } from './i18n/I18nContext';
import { TRANSLATIONS, type TranslationKey } from './i18n/translations';
import { offlineCache } from './offline/cacheDb';
import { CalculatorsPage } from './pages/CalculatorsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DiveDetailPage } from './pages/DiveDetailPage';
import { GearCertsPage } from './pages/GearCertsPage';
import { LogbookPage } from './pages/LogbookPage';
import { SettingsPage } from './pages/SettingsPage';
import { SitesPage } from './pages/SitesPage';
import { StatsPage } from './pages/StatsPage';
import { apiClient } from './services/api';
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
  const [selectedDiveId, setSelectedDiveId] = useState<string | null>(null);
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

  const openDiveDetail = useCallback((diveId: string) => {
    setSelectedDiveId(diveId);
    setActiveView('dive-detail');
  }, []);

  const handleCreateManualDive = useCallback(async () => {
    const created = await apiClient.createDive({
      started_at: new Date().toISOString(),
      duration_s: 2400,
      max_depth_m: 18,
      site_name: 'New Dive',
    });
    await loadInitialData();
    openDiveDetail(created.id);
  }, [loadInitialData, openDiveDetail]);

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
        {activeView === 'dashboard' && (
          <DashboardPage
            stats={stats}
            dives={dives}
            onSelectDive={openDiveDetail}
            onNavigate={setActiveView}
          />
        )}
        {activeView === 'logbook' && (
          <LogbookPage
            dives={dives}
            isOffline={isOffline}
            onSelectDive={openDiveDetail}
            onCreateManualDive={handleCreateManualDive}
          />
        )}
        {activeView === 'dive-detail' && selectedDiveId && (
          <DiveDetailPage
            diveId={selectedDiveId}
            isOffline={isOffline}
            onBack={() => setActiveView('logbook')}
            onSaved={loadInitialData}
          />
        )}
        {activeView === 'statistics' && <StatsPage stats={stats} />}
        {activeView === 'sites' && <SitesPage isOffline={isOffline} />}
        {activeView === 'gear-certs' && <GearCertsPage isOffline={isOffline} />}
        {activeView === 'calculators' && <CalculatorsPage />}
        {activeView === 'settings' && (
          <SettingsPage
            isOffline={isOffline}
            onDataChanged={loadInitialData}
            onOpenDive={openDiveDetail}
          />
        )}
      </AppShell>
    </PreferencesContext.Provider>
  );
}

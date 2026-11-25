import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { NewDiveChoicePage } from './pages/NewDiveChoicePage';
import { SettingsPage } from './pages/SettingsPage';
import { SitesPage } from './pages/SitesPage';
import { StatsPage } from './pages/StatsPage';
import { apiClient } from './services/api';
import {
  type AppView,
  type DiveSummary,
  type DraftFitInit,
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
  const [draftFit, setDraftFit] = useState<DraftFitInit | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [dives, setDives] = useState<DiveSummary[]>([]);

  // Unsaved-changes guard (#7)
  const [isFormDirty, setIsFormDirty] = useState(false);
  const saveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);
  const [pendingView, setPendingView] = useState<AppView | null>(null);

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

  const requestNavigate = useCallback(
    (nextView: AppView) => {
      if (activeView === 'dive-detail' && isFormDirty && nextView !== 'dive-detail') {
        setPendingView(nextView);
        return;
      }
      if (nextView !== 'dive-detail') {
        setDraftFit(null);
      }
      setActiveView(nextView);
    },
    [activeView, isFormDirty],
  );

  const openDiveDetail = useCallback((diveId: string) => {
    setDraftFit(null);
    setSelectedDiveId(diveId);
    setActiveView('dive-detail');
  }, []);

  const handleDirtyChange = useCallback(
    (dirty: boolean, saveFn: (() => Promise<boolean>) | null) => {
      setIsFormDirty(dirty);
      saveHandlerRef.current = saveFn;
    },
    [],
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
        onNavigate={requestNavigate}
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
            isOffline={isOffline}
            onSelectDive={openDiveDetail}
            onStartNewDive={() => requestNavigate('new-dive-choice')}
          />
        )}
        {activeView === 'logbook' && (
          <LogbookPage
            dives={dives}
            isOffline={isOffline}
            onSelectDive={openDiveDetail}
            onStartNewDive={() => requestNavigate('new-dive-choice')}
          />
        )}
        {activeView === 'new-dive-choice' && (
          <NewDiveChoicePage
            onBack={() => setActiveView('logbook')}
            onStartManual={() => {
              setDraftFit(null);
              setSelectedDiveId(null);
              setActiveView('dive-detail');
            }}
            onFitParsed={(parsedDraft) => {
              setDraftFit(parsedDraft);
              setSelectedDiveId(null);
              setActiveView('dive-detail');
            }}
          />
        )}
        {activeView === 'dive-detail' && (
          <DiveDetailPage
            diveId={selectedDiveId}
            draftFit={draftFit}
            isOffline={isOffline}
            onDirtyChange={handleDirtyChange}
            onRequestBack={() => requestNavigate('logbook')}
            onSaved={async (savedId) => {
              setSelectedDiveId(savedId);
              setDraftFit(null);
              await loadInitialData();
            }}
            onDeleted={async () => {
              setSelectedDiveId(null);
              setDraftFit(null);
              await loadInitialData();
              setActiveView('logbook');
            }}
          />
        )}
        {activeView === 'statistics' && <StatsPage stats={stats} />}
        {activeView === 'sites' && <SitesPage isOffline={isOffline} />}
        {activeView === 'gear-certs' && <GearCertsPage isOffline={isOffline} />}
        {activeView === 'calculators' && <CalculatorsPage />}
        {activeView === 'settings' && (
          <SettingsPage isOffline={isOffline} onDataChanged={loadInitialData} />
        )}

        {/* Unsaved Changes Confirmation Modal (#7) */}
        {pendingView && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4 shadow-xl">
              <h2 className="text-base font-semibold text-slate-900">
                {prefsValue.t('unsavedTitle')}
              </h2>
              <p className="text-sm text-slate-600">{prefsValue.t('unsavedMessage')}</p>
              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingView(null)}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {prefsValue.t('continueEditing')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = pendingView;
                    setPendingView(null);
                    setIsFormDirty(false);
                    setDraftFit(null);
                    setActiveView(target);
                  }}
                  className="rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 px-3.5 py-2 text-xs font-medium text-red-700 cursor-pointer"
                >
                  {prefsValue.t('leaveWithoutSaving')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      const target = pendingView;
                      const ok = saveHandlerRef.current ? await saveHandlerRef.current() : false;
                      if (ok) {
                        setPendingView(null);
                        setIsFormDirty(false);
                        setActiveView(target);
                      }
                    })();
                  }}
                  className="rounded-lg bg-sky-600 hover:bg-sky-700 px-3.5 py-2 text-xs font-medium text-white cursor-pointer"
                >
                  {prefsValue.t('saveAndLeave')}
                </button>
              </div>
            </div>
          </div>
        )}
      </AppShell>
    </PreferencesContext.Provider>
  );
}

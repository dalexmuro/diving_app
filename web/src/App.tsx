import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { PwaUpdateBanner } from './components/PwaUpdateBanner';
import { PreferencesContext } from './i18n/I18nContext';
import { TRANSLATIONS, type TranslationKey } from './i18n/translations';
import { offlineCache } from './offline/cacheDb';
import { DashboardPage } from './pages/DashboardPage';
import { LogbookPage } from './pages/LogbookPage';
import { apiClient } from './services/api';
import {
  type AppView,
  type DiveSummary,
  type DraftFitInit,
  type GlobalStats,
  type Language,
  type UnitSystem,
} from './types/domain';

// Code-split secondary & heavy pages (e.g., Leaflet in SitesPage) to keep initial Android PWA bundle fast
const DiveDetailPage = lazy(() =>
  import('./pages/DiveDetailPage').then((m) => ({ default: m.DiveDetailPage })),
);
const NewDiveChoicePage = lazy(() =>
  import('./pages/NewDiveChoicePage').then((m) => ({ default: m.NewDiveChoicePage })),
);
const SitesPage = lazy(() => import('./pages/SitesPage').then((m) => ({ default: m.SitesPage })));
const GearCertsPage = lazy(() =>
  import('./pages/GearCertsPage').then((m) => ({ default: m.GearCertsPage })),
);
const CalculatorsPage = lazy(() =>
  import('./pages/CalculatorsPage').then((m) => ({ default: m.CalculatorsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

const VIEW_STORAGE_KEY = 'diving_nav_state_v1';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const VALID_VIEWS: readonly AppView[] = [
  'dashboard',
  'logbook',
  'new-dive-choice',
  'dive-detail',
  'sites',
  'gear-certs',
  'calculators',
  'settings',
];

function getInitialNavState(): { view: AppView; diveId: string | null } {
  try {
    const params = new URLSearchParams(window.location.search);
    const paramView = params.get('view') as AppView | null;
    if (paramView && VALID_VIEWS.includes(paramView)) {
      return { view: paramView, diveId: params.get('dive') };
    }
    const raw = sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { view?: AppView; diveId?: string | null };
      if (parsed.view && VALID_VIEWS.includes(parsed.view) && parsed.view !== 'new-dive-choice') {
        return { view: parsed.view, diveId: parsed.diveId ?? null };
      }
    }
  } catch {
    // Ignore storage errors
  }
  return { view: 'dashboard', diveId: null };
}

function PageFallback() {
  return (
    <div className="space-y-4 py-2" aria-busy="true">
      <div className="h-7 w-44 rounded-lg bg-slate-200/80 animate-pulse" />
      <div className="h-48 rounded-xl bg-slate-200/70 animate-pulse" />
    </div>
  );
}

export function App() {
  const initialNav = useMemo(() => getInitialNavState(), []);

  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [offlineBrowse, setOfflineBrowse] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [hasCachedData, setHasCachedData] = useState(false);

  const [language, setLanguage] = useState<Language>('es');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [ascentLimitMMin, setAscentLimitMMin] = useState(15);

  const [activeView, setActiveView] = useState<AppView>(initialNav.view);
  const [selectedDiveId, setSelectedDiveId] = useState<string | null>(initialNav.diveId);
  const [draftFit, setDraftFit] = useState<DraftFitInit | null>(null);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [dives, setDives] = useState<DiveSummary[]>([]);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Unsaved-changes guard
  const [isFormDirty, setIsFormDirty] = useState(false);
  const saveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);
  const [pendingView, setPendingView] = useState<AppView | null>(null);

  const activeViewRef = useRef(activeView);
  const selectedDiveIdRef = useRef(selectedDiveId);
  const isFormDirtyRef = useRef(isFormDirty);
  const scrollPositionsRef = useRef<Map<AppView, number>>(new Map());
  activeViewRef.current = activeView;
  selectedDiveIdRef.current = selectedDiveId;
  isFormDirtyRef.current = isFormDirty;

  const refreshDivesAndStats = useCallback(async () => {
    const [divesRes, statsRes] = await Promise.all([
      apiClient.fetchDives(),
      apiClient.fetchStats(),
    ]);
    setDives(divesRes.data);
    setStats(statsRes.data);
    setIsOffline(divesRes.offline || statsRes.offline);
  }, []);

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

  // Capture Android Chrome beforeinstallprompt for optional install CTA in Settings
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Sync <meta name="theme-color"> with current surface for cohesive Android status bar
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const isDarkSurface = !authChecked || (!authenticated && !offlineBrowse);
    meta.setAttribute('content', isDarkSurface ? '#0b192c' : '#ffffff');
  }, [authChecked, authenticated, offlineBrowse]);

  // Keep <html lang> in sync with selected language
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Persist navigation state across Android rotation / foldable transitions / tab reclaim
  useEffect(() => {
    try {
      sessionStorage.setItem(
        VIEW_STORAGE_KEY,
        JSON.stringify({ view: activeView, diveId: selectedDiveId }),
      );
    } catch {
      // Ignore storage errors
    }
  }, [activeView, selectedDiveId]);

  // Live online/offline detection & automatic refresh on reconnect
  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => {
      setIsOffline(false);
      if (authenticated || offlineBrowse) {
        void refreshDivesAndStats();
      }
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [authenticated, offlineBrowse, refreshDivesAndStats]);

  // Sync browser History API so Android Back button navigates inside the PWA cleanly
  const pushHistoryView = useCallback((view: AppView, diveId: string | null = null) => {
    try {
      window.history.pushState({ view, diveId }, '');
    } catch {
      // Ignore history API errors in restricted contexts
    }
  }, []);

  useEffect(() => {
    try {
      window.history.replaceState(
        { view: activeViewRef.current, diveId: selectedDiveIdRef.current },
        '',
      );
    } catch {
      // Ignore
    }
    const onPopState = (ev: PopStateEvent) => {
      const state = ev.state as { view?: AppView; diveId?: string | null } | null;
      const targetView: AppView =
        state?.view && VALID_VIEWS.includes(state.view) ? state.view : 'dashboard';

      if (
        activeViewRef.current === 'dive-detail' &&
        isFormDirtyRef.current &&
        targetView !== 'dive-detail'
      ) {
        // Re-push current state and show unsaved-changes guard instead of discarding edits
        try {
          window.history.pushState(
            { view: 'dive-detail', diveId: selectedDiveIdRef.current },
            '',
          );
        } catch {
          // Ignore
        }
        setPendingView(targetView);
        return;
      }

      if (targetView !== 'dive-detail') {
        setDraftFit(null);
      }
      setSelectedDiveId(state?.diveId ?? null);
      setActiveView(targetView);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Scroll to top on detail/creation entry, and restore saved scroll when returning to logbook
  useEffect(() => {
    const savedY = activeView === 'logbook' ? (scrollPositionsRef.current.get('logbook') ?? 0) : 0;
    window.scrollTo({ top: savedY, behavior: 'auto' });
  }, [activeView, selectedDiveId]);

  // Lock body scroll & support Escape dismiss on Unsaved Changes modal
  useEffect(() => {
    if (!pendingView) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingView(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [pendingView]);

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
      if (nextView !== activeView) {
        pushHistoryView(nextView, null);
      }
      setActiveView(nextView);
    },
    [activeView, isFormDirty, pushHistoryView],
  );

  const openDiveDetail = useCallback(
    (diveId: string) => {
      if (activeViewRef.current === 'logbook') {
        scrollPositionsRef.current.set('logbook', window.scrollY);
      }
      setDraftFit(null);
      setSelectedDiveId(diveId);
      pushHistoryView('dive-detail', diveId);
      setActiveView('dive-detail');
    },
    [pushHistoryView],
  );

  const handleDirtyChange = useCallback(
    (dirty: boolean, saveFn: (() => Promise<boolean>) | null) => {
      setIsFormDirty(dirty);
      saveHandlerRef.current = saveFn;
    },
    [],
  );

  const handleSignOut = useCallback(() => {
    void apiClient.logout().finally(() => {
      setAuthenticated(false);
      setOfflineBrowse(false);
    });
  }, []);

  const handleStartNewDive = useCallback(() => {
    requestNavigate('new-dive-choice');
  }, [requestNavigate]);

  const handleInstallPwa = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null);
    }
  }, [installPrompt]);

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
        <PwaUpdateBanner isFormDirty={false} />
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
        onSignOut={handleSignOut}
      >
        <Suspense fallback={<PageFallback />}>
          {activeView === 'dashboard' && (
            <DashboardPage
              stats={stats}
              dives={dives}
              isOffline={isOffline}
              onSelectDive={openDiveDetail}
              onStartNewDive={handleStartNewDive}
            />
          )}
          {activeView === 'logbook' && (
            <LogbookPage
              dives={dives}
              isOffline={isOffline}
              onSelectDive={openDiveDetail}
              onStartNewDive={handleStartNewDive}
            />
          )}
          {activeView === 'new-dive-choice' && (
            <NewDiveChoicePage
              onBack={() => requestNavigate('logbook')}
              onFitParsed={(parsedDraft) => {
                setDraftFit(parsedDraft);
                setSelectedDiveId(null);
                pushHistoryView('dive-detail', null);
                setActiveView('dive-detail');
              }}
              onManualDiveCreated={async (createdId, openDetails) => {
                await refreshDivesAndStats();
                if (openDetails) {
                  openDiveDetail(createdId);
                } else {
                  requestNavigate('logbook');
                }
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
                await refreshDivesAndStats();
              }}
              onDeleted={async () => {
                setSelectedDiveId(null);
                setDraftFit(null);
                await refreshDivesAndStats();
                requestNavigate('logbook');
              }}
            />
          )}
          {activeView === 'sites' && (
            <SitesPage isOffline={isOffline} dives={dives} onSelectDive={openDiveDetail} />
          )}
          {activeView === 'gear-certs' && <GearCertsPage isOffline={isOffline} />}
          {activeView === 'calculators' && <CalculatorsPage />}
          {activeView === 'settings' && (
            <SettingsPage
              isOffline={isOffline}
              userEmail={userEmail}
              canInstallPwa={Boolean(installPrompt)}
              onInstallPwa={handleInstallPwa}
              onSignOut={handleSignOut}
              onDataChanged={refreshDivesAndStats}
            />
          )}
        </Suspense>

        {/* Unsaved Changes Confirmation — Bottom Sheet on mobile, centered Dialog on sm+ */}
        {pendingView && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-modal-title"
            className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4"
          >
            <div className="bg-white rounded-t-2xl sm:rounded-xl border border-slate-200 max-w-md w-full p-5 pb-[max(1.25rem,var(--safe-bottom))] sm:pb-5 max-h-[85dvh] overflow-y-auto space-y-4 shadow-xl">
              <h2 id="unsaved-modal-title" className="text-base font-semibold text-slate-900">
                {prefsValue.t('unsavedTitle')}
              </h2>
              <p className="text-sm text-slate-600">{prefsValue.t('unsavedMessage')}</p>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingView(null)}
                  className="rounded-lg border border-slate-300 px-3.5 py-2.5 sm:py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
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
                    pushHistoryView(target, null);
                    setActiveView(target);
                  }}
                  className="rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 active:bg-red-200/70 px-3.5 py-2.5 sm:py-2 text-xs font-medium text-red-700 cursor-pointer"
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
                        pushHistoryView(target, null);
                        setActiveView(target);
                      }
                    })();
                  }}
                  className="rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 px-3.5 py-2.5 sm:py-2 text-xs font-medium text-white cursor-pointer"
                >
                  {prefsValue.t('saveAndLeave')}
                </button>
              </div>
            </div>
          </div>
        )}
      </AppShell>

      <PwaUpdateBanner
        isFormDirty={isFormDirty}
        isOffline={isOffline}
        onSaveBeforeUpdate={() =>
          saveHandlerRef.current ? saveHandlerRef.current() : Promise.resolve(true)
        }
      />
    </PreferencesContext.Provider>
  );
}

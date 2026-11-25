import {
  Activity,
  Award,
  BookOpen,
  Calculator,
  Compass,
  LayoutDashboard,
  LogOut,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { type AppView } from '../types/domain';

interface AppShellProps {
  activeView: AppView;
  isOffline: boolean;
  userEmail?: string;
  onNavigate: (view: AppView) => void;
  onSignOut: () => void;
  children: ReactNode;
}

/**
 * Detects whether a virtual keyboard (IME) is open on touch devices so the fixed
 * bottom navigation bar does not obstruct active inputs or waste vertical space.
 */
function useVirtualKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const isCoarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (!isCoarse) return;

    const vv = window.visualViewport;
    const handleResize = () => {
      const heightRatio = vv.height / window.innerHeight;
      setOpen(heightRatio < 0.78);
    };
    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, []);

  return open;
}

export function AppShell({
  activeView,
  isOffline,
  userEmail,
  onNavigate,
  onSignOut,
  children,
}: AppShellProps) {
  const { language, unitSystem, t, setPreferences } = usePreferences();
  const keyboardOpen = useVirtualKeyboardOpen();

  const primaryTabs: Array<{ id: AppView; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'dashboard', label: t('navDashboard'), icon: LayoutDashboard },
    { id: 'logbook', label: t('navLogbook'), icon: BookOpen },
    { id: 'statistics', label: t('navStatistics'), icon: Activity },
    { id: 'sites', label: t('navSites'), icon: Compass },
  ];

  const secondaryTabs: Array<{ id: AppView; label: string; icon: typeof Award }> = [
    { id: 'gear-certs', label: t('navGearCerts'), icon: Award },
    { id: 'calculators', label: t('navCalculators'), icon: Calculator },
    { id: 'settings', label: t('navSettings'), icon: Settings },
  ];

  const isPrimaryActive = (id: AppView) =>
    activeView === id ||
    (id === 'logbook' && (activeView === 'dive-detail' || activeView === 'new-dive-choice'));

  const hideBottomBar = keyboardOpen || activeView === 'new-dive-choice';

  return (
    <div className="min-h-dvh flex flex-col sm:flex-row bg-[#f4f7fa] text-slate-900">
      {/* Medium Navigation Rail (640px-1023px: unfolded foldables & portrait tablets) */}
      <aside
        aria-label="Main Rail"
        className="hidden sm:flex lg:hidden sm:w-20 sm:flex-col sm:fixed sm:inset-y-0 bg-[#0b192c] text-slate-100 border-r border-slate-800 pl-[var(--safe-left)] pt-[var(--safe-top)] pb-[var(--safe-bottom)]"
      >
        <div className="flex items-center justify-center h-14 border-b border-slate-800/80">
          <img src="/icon.svg" alt={t('appTitle')} className="w-7 h-7 rounded-lg" />
        </div>

        <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto" aria-label="Main">
          <div className="space-y-1">
            {primaryTabs.map((item) => {
              const Icon = item.icon;
              const active = isPrimaryActive(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] font-medium transition-colors cursor-pointer touch-target ${
                    active
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white active:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate max-w-full">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-800/80 space-y-1">
            {secondaryTabs.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] font-medium transition-colors cursor-pointer touch-target ${
                    active
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white active:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                </button>
              );
            })}
          </div>
        </nav>

        <div className="p-2 border-t border-slate-800/80 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onSignOut}
            aria-label={t('signOut')}
            title={t('signOut')}
            className="p-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer touch-target flex items-center justify-center"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Desktop Expanded Navigation Sidebar (>= 1024px) — preserved */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0b192c] text-slate-100 border-r border-slate-800">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-800/80">
          <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" />
          <span className="font-semibold tracking-tight text-sm text-white">{t('appTitle')}</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto" aria-label="Main">
          <div className="space-y-1">
            {primaryTabs.map((item) => {
              const Icon = item.icon;
              const active = isPrimaryActive(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-800/80 space-y-1">
            {secondaryTabs.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setPreferences({ language: language === 'es' ? 'fr' : 'es' })}
              className="px-2.5 py-1 rounded-md border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              {language.toUpperCase()}
            </button>
            <button
              type="button"
              onClick={() =>
                setPreferences({ unitSystem: unitSystem === 'metric' ? 'imperial' : 'metric' })
              }
              className="px-2.5 py-1 rounded-md border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              {unitSystem === 'metric' ? 'Metric' : 'Imperial'}
            </button>
            <button
              type="button"
              onClick={onSignOut}
              aria-label={t('signOut')}
              title={t('signOut')}
              className="p-1.5 rounded-md border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
          {userEmail && <p className="text-xs text-slate-400 truncate">{userEmail}</p>}
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="flex-1 sm:pl-20 lg:pl-60 flex flex-col min-h-dvh">
        <header className="sticky top-0 z-20 min-h-14 pt-[var(--safe-top)] bg-white/95 backdrop-blur border-b border-slate-200 pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))] sm:px-6 lg:px-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:hidden min-w-0">
            <img src="/icon.svg" alt="" className="w-6 h-6 rounded-md shrink-0" />
            <span className="font-semibold text-sm text-slate-900 truncate">{t('appTitle')}</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
            <span
              role="status"
              aria-live="polite"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isOffline
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {isOffline ? <WifiOff className="w-3.5 h-3.5 shrink-0" /> : <Wifi className="w-3.5 h-3.5 shrink-0" />}
              <span className="sm:hidden">{isOffline ? t('offlineShort') : t('onlineShort')}</span>
              <span className="hidden sm:inline">{isOffline ? t('offlineMode') : t('onlineSynced')}</span>
            </span>

            {/* Mobile secondary utility buttons (44px touch targets on coarse pointers) */}
            <div className="flex items-center gap-0.5 sm:hidden">
              {secondaryTabs.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.label}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onNavigate(item.id)}
                    className={`touch-target flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                      active
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100 active:bg-slate-200/70'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        <main
          className={`workspace-container flex-1 w-full max-w-6xl mx-auto p-3.5 sm:p-6 lg:p-8 pl-[max(0.875rem,var(--safe-left))] pr-[max(0.875rem,var(--safe-right))] ${
            hideBottomBar
              ? 'pb-[max(1.5rem,var(--safe-bottom))] sm:pb-8'
              : 'pb-[calc(4.75rem+var(--safe-bottom))] sm:pb-8'
          }`}
        >
          {children}
        </main>
      </div>

      {/* Mobile Bottom Primary Navigation (< 640px) — safe-area aware, auto-hidden when IME keyboard opens */}
      {!hideBottomBar && (
        <nav
          aria-label="Mobile Primary"
          className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-[#0b192c] text-slate-300 border-t border-slate-800 pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)] grid grid-cols-4 select-none"
        >
          {primaryTabs.map((item) => {
            const Icon = item.icon;
            const active = isPrimaryActive(item.id);
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center justify-center gap-1 min-h-14 py-1.5 text-[11px] font-medium transition-colors cursor-pointer active:bg-slate-800/70 ${
                  active ? 'text-sky-400' : 'text-slate-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="truncate max-w-[80px]">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

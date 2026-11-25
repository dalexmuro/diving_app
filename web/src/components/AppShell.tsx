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
import { type ReactNode } from 'react';
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

export function AppShell({
  activeView,
  isOffline,
  userEmail,
  onNavigate,
  onSignOut,
  children,
}: AppShellProps) {
  const { language, unitSystem, t, setPreferences } = usePreferences();

  const primaryTabs: Array<{ id: AppView; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'dashboard', label: t('navDashboard'), icon: LayoutDashboard },
    { id: 'logbook', label: activeView === 'dive-detail' ? t('navLogbook') : t('navLogbook'), icon: BookOpen },
    { id: 'statistics', label: t('navStatistics'), icon: Activity },
    { id: 'sites', label: t('navSites'), icon: Compass },
  ];

  const secondaryTabs: Array<{ id: AppView; label: string; icon: typeof Award }> = [
    { id: 'gear-certs', label: t('navGearCerts'), icon: Award },
    { id: 'calculators', label: t('navCalculators'), icon: Calculator },
    { id: 'settings', label: t('navSettings'), icon: Settings },
  ];

  const isPrimaryActive = (id: AppView) =>
    activeView === id || (id === 'logbook' && activeView === 'dive-detail');

  return (
    <div className="min-h-dvh flex flex-col md:flex-row bg-[#f4f7fa] text-slate-900">
      {/* Desktop Navigation Rail */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-[#0b192c] text-slate-100 border-r border-slate-800">
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
      <div className="flex-1 md:pl-60 flex flex-col min-h-dvh pb-16 md:pb-0">
        <header className="sticky top-0 z-20 h-14 bg-white/95 backdrop-blur border-b border-slate-200 px-4 md:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 md:hidden">
            <img src="/icon.svg" alt="" className="w-6 h-6 rounded-md" />
            <span className="font-semibold text-sm text-slate-900">{t('appTitle')}</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isOffline
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {isOffline ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
              <span>{isOffline ? t('offlineMode') : t('onlineSynced')}</span>
            </span>

            {/* Mobile utility buttons */}
            <div className="flex items-center gap-1 md:hidden">
              {secondaryTabs.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.label}
                    onClick={() => onNavigate(item.id)}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${
                      activeView === item.id
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-6xl mx-auto p-4 md:p-8">{children}</main>
      </div>

      {/* Mobile Bottom Primary Navigation */}
      <nav
        aria-label="Mobile Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-20 h-16 bg-[#0b192c] text-slate-300 border-t border-slate-800 grid grid-cols-4"
      >
        {primaryTabs.map((item) => {
          const Icon = item.icon;
          const active = isPrimaryActive(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer ${
                active ? 'text-sky-400' : 'text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[80px]">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

import { Check, Download, Fingerprint, Link2, LogOut, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';
import { type Language, type UnitSystem } from '../types/domain';

interface SettingsPageProps {
  isOffline: boolean;
  userEmail?: string;
  canInstallPwa?: boolean;
  onInstallPwa?: () => Promise<void>;
  onSignOut: () => void;
  onDataChanged: () => Promise<void>;
}

export function SettingsPage({
  isOffline,
  userEmail,
  canInstallPwa = false,
  onInstallPwa,
  onSignOut,
  onDataChanged,
}: SettingsPageProps) {
  const { language, unitSystem, ascentLimitMMin, t, setPreferences } = usePreferences();
  const [limitInput, setLimitInput] = useState(String(ascentLimitMMin));
  const [suuntoConnected, setSuuntoConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [passkeyDone, setPasskeyDone] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(
    null,
  );

  useEffect(() => {
    setLimitInput(String(ascentLimitMMin));
  }, [ascentLimitMMin]);

  useEffect(() => {
    if (isOffline) return;
    void apiClient.getSuuntoStatus().then((st) => setSuuntoConnected(st.connected));
    void apiClient.checkSession().then((s) => {
      if (s.hasPasskey) setPasskeyDone(true);
    });
  }, [isOffline]);

  async function handleSyncSuunto() {
    setSyncing(true);
    setStatusMessage(null);
    try {
      const res = await apiClient.syncSuunto();
      await onDataChanged();
      setStatusMessage({
        text: `Suunto: +${res.imported} (${res.skipped} skipped)`,
        isError: false,
      });
    } catch (err) {
      setStatusMessage({
        text: err instanceof Error ? err.message : 'Sync failed',
        isError: true,
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleRegisterFingerprint() {
    setStatusMessage(null);
    try {
      await apiClient.registerPasskey();
      setPasskeyDone(true);
    } catch (err) {
      setStatusMessage({
        text: err instanceof Error ? err.message : 'Passkey error',
        isError: true,
      });
    }
  }

  return (
    <section className="space-y-6">
      <h1 className="text-[clamp(1.35rem,2.5vw,1.6rem)] font-semibold tracking-tight text-slate-900">
        {t('navSettings')}
      </h1>

      {statusMessage && (
        <div
          role={statusMessage.isError ? 'alert' : 'status'}
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-xs font-medium ${
            statusMessage.isError
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Language, Units & Ascent Limit */}
      <div className="panel-surface p-4 sm:p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">{t('preferencesSectionTitle')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="space-y-1.5 text-xs font-medium text-slate-700">
            <span>{t('settingsLanguage')}</span>
            <select
              value={language}
              onChange={(e) => void setPreferences({ language: e.target.value as Language })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
            >
              <option value="es">Español</option>
              <option value="fr">Français</option>
            </select>
          </label>

          <label className="space-y-1.5 text-xs font-medium text-slate-700">
            <span>{t('settingsUnits')}</span>
            <select
              value={unitSystem}
              onChange={(e) => void setPreferences({ unitSystem: e.target.value as UnitSystem })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
            >
              <option value="metric">{t('unitsMetric')}</option>
              <option value="imperial">{t('unitsImperial')}</option>
            </select>
          </label>

          <label className="space-y-1.5 text-xs font-medium text-slate-700">
            <span>{t('settingsAscentLimit')}</span>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                min="5"
                max="30"
                step="1"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
              <button
                type="button"
                onClick={() => {
                  const clamped = Math.min(30, Math.max(5, Number(limitInput) || 15));
                  setLimitInput(String(clamped));
                  void setPreferences({ ascentLimitMMin: clamped });
                }}
                className="rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-medium px-3.5 py-2 cursor-pointer"
              >
                {t('saveChanges')}
              </button>
            </div>
          </label>
        </div>
      </div>

      {/* Suunto Cloud Sync & Android Biometric Passkey */}
      {!isOffline && (
        <div className="panel-surface p-4 sm:p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">{t('syncSectionTitle')}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/api/suunto/connect"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-medium px-4 py-2.5 transition-colors"
            >
              <Link2 className="w-4 h-4 text-sky-600" />
              {suuntoConnected ? t('suuntoConnected') : t('connectSuunto')}
            </a>

            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleSyncSuunto()}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? t('syncing') : t('syncNow')}
            </button>
          </div>

          <div className="pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => void handleRegisterFingerprint()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-sm font-medium px-4 py-2.5 transition-colors cursor-pointer"
            >
              {passkeyDone ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Fingerprint className="w-4 h-4 text-sky-600" />
              )}
              <span>
                {passkeyDone ? t('fingerprintRegistered') : t('registerFingerprint')}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Optional PWA Install Prompt (shown only when browser supports installation) */}
      {canInstallPwa && onInstallPwa && (
        <div className="panel-surface p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">{t('installPwaTitle')}</h2>
          <button
            type="button"
            onClick={() => void onInstallPwa()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0b192c] hover:bg-slate-800 text-white text-sm font-medium px-4 py-2.5 cursor-pointer"
          >
            <Download className="w-4 h-4 text-sky-400" />
            <span>{t('installPwaBtn')}</span>
          </button>
        </div>
      )}

      {/* Account & Sign Out (accessible on Android mobile as well as desktop) */}
      <div className="panel-surface p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{t('accountSectionTitle')}</h2>
          {userEmail && <p className="text-xs text-slate-500 truncate">{userEmail}</p>}
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 active:bg-red-200/70 text-red-700 text-sm font-medium px-4 py-2.5 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>{t('signOut')}</span>
        </button>
      </div>
    </section>
  );
}

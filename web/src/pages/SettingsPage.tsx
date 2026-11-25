import { Check, Fingerprint, Link2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';
import { type Language, type UnitSystem } from '../types/domain';

interface SettingsPageProps {
  isOffline: boolean;
  onDataChanged: () => Promise<void>;
}

export function SettingsPage({ isOffline, onDataChanged }: SettingsPageProps) {
  const { language, unitSystem, ascentLimitMMin, t, setPreferences } = usePreferences();
  const [limitInput, setLimitInput] = useState(String(ascentLimitMMin));
  const [suuntoConnected, setSuuntoConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [passkeyDone, setPasskeyDone] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
      setStatusMessage(`Suunto: +${res.imported} (${res.skipped} skipped)`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Sync failed');
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
      setStatusMessage(err instanceof Error ? err.message : 'Passkey error');
    }
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('navSettings')}</h1>

      {statusMessage && (
        <div className="panel-surface px-4 py-3 text-xs font-medium text-slate-800">
          {statusMessage}
        </div>
      )}

      {/* Language, Units & Ascent Limit */}
      <div className="panel-surface p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
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
              min="5"
              max="30"
              step="1"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
            />
            <button
              type="button"
              onClick={() =>
                void setPreferences({ ascentLimitMMin: Math.max(5, Number(limitInput) || 15) })
              }
              className="rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium px-3 py-2 cursor-pointer"
            >
              {t('saveChanges')}
            </button>
          </div>
        </label>
      </div>

      {/* Suunto Cloud Sync & Android Biometric Passkey (no .fit upload here per #9) */}
      {!isOffline && (
        <div className="panel-surface p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/api/suunto/connect"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium px-4 py-2 transition-colors"
            >
              <Link2 className="w-4 h-4 text-sky-600" />
              {suuntoConnected ? t('suuntoConnected') : t('connectSuunto')}
            </a>

            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleSyncSuunto()}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? t('syncing') : t('syncNow')}
            </button>
          </div>

          <div className="pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => void handleRegisterFingerprint()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium px-4 py-2 transition-colors cursor-pointer"
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
    </section>
  );
}

import { Fingerprint, Globe, HardDrive, LogIn } from 'lucide-react';
import { useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';

interface AuthGateProps {
  hasCachedData: boolean;
  onAuthenticated: () => void;
  onEnterOfflineMode: () => void;
}

export function AuthGate({
  hasCachedData,
  onAuthenticated,
  onEnterOfflineMode,
}: AuthGateProps) {
  const { language, t, setPreferences } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supportsWebAuthn =
    typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';

  async function handleFingerprintUnlock() {
    setError(null);
    setBusy(true);
    try {
      const ok = await apiClient.unlockWithPasskey();
      if (ok) onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey authentication failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col justify-between bg-[#0b192c] text-slate-100 p-6">
      <header className="flex items-center justify-between max-w-md w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="w-8 h-8 rounded-lg" />
          <span className="font-semibold tracking-tight text-base">{t('appTitle')}</span>
        </div>
        <button
          type="button"
          onClick={() => setPreferences({ language: language === 'es' ? 'fr' : 'es' })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 text-sky-400" />
          {language.toUpperCase()}
        </button>
      </header>

      <main className="max-w-md w-full mx-auto my-auto py-10">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-6 space-y-6">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight text-white">
              {t('authTitle')}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">{t('authSubtitle')}</p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/40 bg-red-950/60 px-3.5 py-2.5 text-xs text-red-200"
            >
              {error}
            </div>
          )}

          <div className="space-y-3">
            <a
              href="/api/auth/google"
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm px-4 py-2.5 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              {t('signInGoogle')}
            </a>

            {supportsWebAuthn && (
              <button
                type="button"
                disabled={busy}
                onClick={handleFingerprintUnlock}
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-800 disabled:opacity-50 text-slate-100 font-medium text-sm px-4 py-2.5 transition-colors cursor-pointer"
              >
                <Fingerprint className="w-4 h-4 text-sky-400" />
                {t('unlockFingerprint')}
              </button>
            )}

            {hasCachedData && (
              <button
                type="button"
                onClick={onEnterOfflineMode}
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg border border-slate-800 hover:bg-slate-800/60 text-slate-300 font-medium text-xs px-4 py-2 transition-colors cursor-pointer"
              >
                <HardDrive className="w-4 h-4 text-amber-400" />
                {t('viewCachedOffline')}
              </button>
            )}
          </div>
        </div>
      </main>

      <footer className="max-w-md w-full mx-auto text-center text-xs text-slate-400">
        Suunto Nautic · Cloudflare D1 &amp; R2 · Offline PWA
      </footer>
    </div>
  );
}

import { ArrowLeft, Fingerprint, Globe, HardDrive, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';

interface AuthGateProps {
  hasCachedData: boolean;
  onAuthenticated: () => void;
  onEnterOfflineMode: () => void;
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

export function AuthGate({
  hasCachedData,
  onAuthenticated,
  onEnterOfflineMode,
}: AuthGateProps) {
  const { language, t, setPreferences } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('auth_error') === 'unauthorized';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth_error')) {
      params.delete('auth_error');
      const qs = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }
  }, []);

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
    <div className="min-h-dvh flex flex-col justify-between bg-[#0b192c] text-slate-100 pt-[max(1.5rem,var(--safe-top))] pb-[max(1.5rem,var(--safe-bottom))] pl-[max(1.5rem,var(--safe-left))] pr-[max(1.5rem,var(--safe-right))]">
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
        {unauthorized ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/30 bg-slate-900/95 p-7 space-y-6 text-center shadow-xl"
          >
            <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <ShieldAlert className="w-7 h-7 text-red-400" />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-red-400">
                403 · Forbidden
              </p>
              <h1 className="text-xl font-bold tracking-tight text-white">
                {t('authUnauthorizedTitle')}
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                {t('authUnauthorizedMessage')}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed pt-1">
                {t('authUnauthorizedHint')}
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <a
                href="/api/auth/google"
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg bg-white hover:bg-slate-100 text-slate-900 font-medium text-sm px-4 py-2.5 transition-colors"
              >
                <GoogleIcon />
                <span>{t('authTryAnotherAccount')}</span>
              </a>
              <button
                type="button"
                onClick={() => setUnauthorized(false)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-800 text-slate-200 font-medium text-xs px-4 py-2.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('authBackToLogin')}</span>
              </button>
            </div>
          </div>
        ) : (
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
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg bg-white hover:bg-slate-100 text-slate-900 font-medium text-sm px-4 py-2.5 transition-colors"
              >
                <GoogleIcon />
                <span>{t('signInGoogle')}</span>
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
        )}
      </main>

      <footer className="max-w-md w-full mx-auto text-center text-xs text-slate-400">
        Suunto Nautic · Logbook &amp; Telemetry
      </footer>
    </div>
  );
}

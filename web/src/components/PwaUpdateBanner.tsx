import { RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { usePreferences } from '../i18n/I18nContext';

interface PwaUpdateBannerProps {
  isFormDirty: boolean;
  onSaveBeforeUpdate?: () => Promise<boolean>;
}

/**
 * Non-destructive PWA update prompt.
 * Never triggers an automatic reload; when a dive form has unsaved edits,
 * it explicitly prevents losing data and lets the user save first.
 */
export function PwaUpdateBanner({ isFormDirty, onSaveBeforeUpdate }: PwaUpdateBannerProps) {
  const { t } = usePreferences();
  const [updating, setUpdating] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Check for updates periodically (hourly) without forcing reload
      window.setInterval(() => {
        if (navigator.onLine) {
          void registration.update();
        }
      }, 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;

  async function handleUpdate() {
    setUpdating(true);
    try {
      if (isFormDirty && onSaveBeforeUpdate) {
        const saved = await onSaveBeforeUpdate();
        if (!saved) {
          setUpdating(false);
          return;
        }
      }
      await updateServiceWorker(true);
    } catch {
      setUpdating(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(4.5rem+var(--safe-bottom))] md:bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-40 rounded-xl border border-sky-500/40 bg-[#0b192c] text-slate-100 px-4 py-3 shadow-xl flex items-center justify-between gap-3"
    >
      <div className="space-y-0.5 min-w-0">
        <p className="text-xs font-semibold text-white">{t('pwaUpdateAvailable')}</p>
        {isFormDirty && <p className="text-[11px] text-amber-300">{t('pwaUpdateUnsavedHint')}</p>}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          disabled={updating}
          onClick={() => void handleUpdate()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${updating ? 'animate-spin' : ''}`} />
          <span>{isFormDirty ? t('saveAndUpdate') : t('pwaUpdateNow')}</span>
        </button>
        <button
          type="button"
          aria-label={t('cancel')}
          onClick={() => setNeedRefresh(false)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

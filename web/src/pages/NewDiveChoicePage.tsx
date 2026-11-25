import { ArrowLeft, FileUp, PenLine } from 'lucide-react';
import { type ChangeEvent, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';
import { type DraftFitInit } from '../types/domain';

interface NewDiveChoicePageProps {
  onBack: () => void;
  onStartManual: () => void;
  onFitParsed: (draft: DraftFitInit) => void;
}

export function NewDiveChoicePage({
  onBack,
  onStartManual,
  onFitParsed,
}: NewDiveChoicePageProps) {
  const { t } = usePreferences();
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setParsing(true);
    try {
      const draft = await apiClient.parseFitDraft(file);
      onFitParsed(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse .fit file');
    } finally {
      setParsing(false);
      e.target.value = '';
    }
  }

  return (
    <section className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('backToLogbook')}
      </button>

      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {t('newDiveChooseTitle')}
      </h1>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <label className="panel-surface p-6 space-y-3 hover:border-sky-400 transition-colors cursor-pointer block">
          <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
            <FileUp className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            {parsing ? '...' : t('importFit')}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">{t('importFitDesc')}</p>
          <input
            type="file"
            accept=".fit"
            disabled={parsing}
            onChange={(e) => void handleFileSelect(e)}
            className="hidden"
          />
        </label>

        <button
          type="button"
          onClick={onStartManual}
          className="panel-surface p-6 space-y-3 text-left hover:border-sky-400 transition-colors cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
            <PenLine className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">{t('createManual')}</h2>
          <p className="text-sm text-slate-600 leading-relaxed">{t('createManualDesc')}</p>
        </button>
      </div>
    </section>
  );
}

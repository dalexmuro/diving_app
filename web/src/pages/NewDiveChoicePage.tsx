import { ArrowLeft, CheckCircle2, FileUp, PenLine, Plus } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';
import { type DraftFitInit } from '../types/domain';

interface NewDiveChoicePageProps {
  onBack: () => void;
  onFitParsed: (draft: DraftFitInit) => void;
  onManualDiveCreated: (diveId: string, openDetails: boolean) => Promise<void>;
}

type StepMode = 'choose' | 'quick-manual' | 'created-prompt';

export function NewDiveChoicePage({
  onBack,
  onFitParsed,
  onManualDiveCreated,
}: NewDiveChoicePageProps) {
  const { t } = usePreferences();
  const [mode, setMode] = useState<StepMode>('choose');
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdDiveId, setCreatedDiveId] = useState<string | null>(null);

  // Quick manual form state (4 essential fields, using local date consistently)
  const [diveDate, setDiveDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [endTime, setEndTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [durationMin, setDurationMin] = useState('');
  const [maxDepthM, setMaxDepthM] = useState('');

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.fit')) {
      setError(t('invalidFitFile'));
      e.target.value = '';
      return;
    }
    setError(null);
    setParsing(true);
    try {
      const draft = await apiClient.parseFitDraft(file);
      onFitParsed(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('invalidFitFile'));
    } finally {
      setParsing(false);
      e.target.value = '';
    }
  }

  async function handleQuickCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const durMin = Math.max(1, Number(durationMin) || 0);
      const durSec = Math.round(durMin * 60);
      const endDate = new Date(`${diveDate}T${endTime || '12:00'}:00`);
      const endedIso = Number.isNaN(endDate.getTime())
        ? new Date().toISOString()
        : endDate.toISOString();
      const startedIso = new Date(new Date(endedIso).getTime() - durSec * 1000).toISOString();

      const dive = await apiClient.createDive({
        started_at: startedIso,
        ended_at: endedIso,
        duration_s: durSec,
        max_depth_m: Number(maxDepthM) || 0,
      });
      setCreatedDiveId(dive.id);
      setMode('created-prompt');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create dive');
    } finally {
      setCreating(false);
    }
  }

  if (mode === 'created-prompt' && createdDiveId) {
    return (
      <section className="max-w-lg mx-auto py-8">
        <div className="panel-surface p-6 space-y-5 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold text-slate-900">{t('diveCreatedTitle')}</h1>
            <p className="text-sm text-slate-600">{t('diveCreatedAskDetails')}</p>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => void onManualDiveCreated(createdDiveId, false)}
              className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium px-4 py-2.5 cursor-pointer"
            >
              {t('doneBackToLogbook')}
            </button>
            <button
              type="button"
              onClick={() => void onManualDiveCreated(createdDiveId, true)}
              className="rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2.5 cursor-pointer"
            >
              {t('addMoreDetails')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (mode === 'quick-manual') {
    return (
      <section className="max-w-xl mx-auto space-y-6">
        <button
          type="button"
          onClick={() => setMode('choose')}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('backToLogbook')}
        </button>

        <div className="panel-surface p-6 space-y-5">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              {t('quickDiveTitle')}
            </h1>
            <p className="text-sm text-slate-600">{t('quickDiveSubtitle')}</p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
            >
              {error}
            </div>
          )}

          <form onSubmit={(e) => void handleQuickCreate(e)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('dateLabel')}</span>
                <input
                  type="date"
                  required
                  value={diveDate}
                  onChange={(e) => setDiveDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
                />
              </label>

              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('endTimeLabel')}</span>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
                />
              </label>

              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('durationMin')}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="any"
                  required
                  placeholder="45"
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
                />
              </label>

              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('maxDepth')} (m)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  required
                  placeholder="18.5"
                  value={maxDepthM}
                  onChange={(e) => setMaxDepthM(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
                />
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {creating ? '...' : t('createDiveBtn')}
              </button>
            </div>
          </form>
        </div>
      </section>
    );
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
        <label className="panel-surface p-6 space-y-3 hover:border-sky-400 focus-within:ring-2 focus-within:ring-sky-500 active:bg-slate-50 transition-colors cursor-pointer block">
          <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
            <FileUp className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            {parsing ? '...' : t('importFit')}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">{t('importFitDesc')}</p>
          <input
            type="file"
            accept=".fit,.FIT,application/octet-stream,*/*"
            disabled={parsing}
            onChange={(e) => void handleFileSelect(e)}
            className="sr-only"
          />
        </label>

        <button
          type="button"
          onClick={() => setMode('quick-manual')}
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

import { ArrowLeft, Check, Save } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { DiveProfileChart } from '../charts/DiveProfileChart';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';
import {
  formatDepth,
  formatDuration,
  formatPressure,
  formatSac,
  formatTemp,
} from '../services/units';
import {
  type DiveDetail,
  type GasType,
  type RatingScale,
  type TankMaterial,
  type WaterType,
} from '../types/domain';

interface DiveDetailPageProps {
  diveId: string;
  isOffline: boolean;
  onBack: () => void;
  onSaved: () => Promise<void>;
}

export function DiveDetailPage({ diveId, isOffline, onBack, onSaved }: DiveDetailPageProps) {
  const { unitSystem, t } = usePreferences();
  const [dive, setDive] = useState<DiveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  // Editable state
  const [siteName, setSiteName] = useState('');
  const [computerName, setComputerName] = useState('');
  const [waterType, setWaterType] = useState<WaterType | ''>('');
  const [gasType, setGasType] = useState<GasType>('air');
  const [o2Pct, setO2Pct] = useState('21');
  const [hePct, setHePct] = useState('0');
  const [startPressure, setStartPressure] = useState('');
  const [endPressure, setEndPressure] = useState('');
  const [tankVolume, setTankVolume] = useState('');
  const [tankMaterial, setTankMaterial] = useState<TankMaterial | ''>('');
  const [ballast, setBallast] = useState('');
  const [deco, setDeco] = useState(false);
  const [decoMinutes, setDecoMinutes] = useState('0');
  const [visibility, setVisibility] = useState<RatingScale | ''>('');
  const [buoyancy, setBuoyancy] = useState<RatingScale | ''>('');
  const [feeling, setFeeling] = useState<RatingScale | ''>('');
  const [buddy, setBuddy] = useState('');
  const [diveCenter, setDiveCenter] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    void apiClient.fetchDiveDetail(diveId).then(({ data }) => {
      if (!active || !data) {
        setLoading(false);
        return;
      }
      setDive(data);
      setSiteName(data.site_name ?? '');
      setComputerName(data.computer_name ?? '');
      setWaterType(data.water_type ?? '');
      setGasType(data.gas_type);
      setO2Pct(String(data.o2_pct));
      setHePct(String(data.he_pct));
      setStartPressure(data.start_pressure_bar != null ? String(data.start_pressure_bar) : '');
      setEndPressure(data.end_pressure_bar != null ? String(data.end_pressure_bar) : '');
      setTankVolume(data.tank_volume_l != null ? String(data.tank_volume_l) : '');
      setTankMaterial(data.tank_material ?? '');
      setBallast(data.ballast_kg != null ? String(data.ballast_kg) : '');
      setDeco(data.deco === 1);
      setDecoMinutes(String(Math.round((data.deco_time_s ?? 0) / 60)));
      setVisibility(data.visibility ?? '');
      setBuoyancy(data.buoyancy ?? '');
      setFeeling(data.feeling ?? '');
      setBuddy(data.buddy ?? '');
      setDiveCenter(data.dive_center ?? '');
      try {
        const parsedTags = JSON.parse(data.tags_json || '[]') as string[];
        setTags(parsedTags.join(', '));
      } catch {
        setTags('');
      }
      setNotes(data.notes ?? '');
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [diveId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-slate-200 animate-pulse" />
        <div className="h-64 rounded-xl bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (!dive) {
    return (
      <div className="panel-surface p-6 space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('backToLogbook')}
        </button>
      </div>
    );
  }

  const pStartNum = startPressure ? Number(startPressure) : null;
  const pEndNum = endPressure ? Number(endPressure) : null;
  const usedPressureBar =
    pStartNum != null && pEndNum != null && pStartNum >= pEndNum ? pStartNum - pEndNum : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isOffline || !dive) return;
    setSaving(true);
    setSavedToast(false);
    try {
      const updated = await apiClient.updateDive(dive.id, {
        site_name: siteName.trim() || undefined,
        computer_name: computerName.trim() || null,
        water_type: waterType || null,
        gas_type: gasType,
        o2_pct: Number(o2Pct) || 21,
        he_pct: Number(hePct) || 0,
        start_pressure_bar: startPressure ? Number(startPressure) : null,
        end_pressure_bar: endPressure ? Number(endPressure) : null,
        tank_volume_l: tankVolume ? Number(tankVolume) : null,
        tank_material: tankMaterial || null,
        ballast_kg: ballast ? Number(ballast) : null,
        deco: deco ? 1 : 0,
        deco_time_s: deco ? Math.max(0, Math.round(Number(decoMinutes) * 60)) : 0,
        visibility: visibility || null,
        buoyancy: buoyancy || null,
        feeling: feeling || null,
        buddy: buddy.trim() || null,
        dive_center: diveCenter.trim() || null,
        tags: tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        notes: notes.trim() || null,
      });
      setDive(updated);
      await onSaved();
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const ratingOptions: Array<{ value: RatingScale; label: string }> = [
    { value: 'poor', label: t('ratingPoor') },
    { value: 'normal', label: t('ratingNormal') },
    { value: 'good', label: t('ratingGood') },
    { value: 'excellent', label: t('ratingExcellent') },
  ];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('backToLogbook')}
        </button>
        <span className="text-xs text-slate-500 tabular-telemetry">
          {new Date(dive.started_at).toLocaleString()}
          {dive.ended_at ? ` → ${new Date(dive.ended_at).toLocaleTimeString()}` : ''}
        </span>
      </div>

      {/* Telemetry Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="panel-surface p-3.5">
          <p className="text-xs text-slate-500">{t('maxDepth')}</p>
          <p className="text-lg font-semibold tabular-telemetry text-slate-900">
            {formatDepth(dive.max_depth_m, unitSystem)}
          </p>
        </div>
        <div className="panel-surface p-3.5">
          <p className="text-xs text-slate-500">{t('avgDepth')}</p>
          <p className="text-lg font-semibold tabular-telemetry text-slate-900">
            {formatDepth(dive.avg_depth_m, unitSystem)}
          </p>
        </div>
        <div className="panel-surface p-3.5">
          <p className="text-xs text-slate-500">{t('underwaterTime')}</p>
          <p className="text-lg font-semibold tabular-telemetry text-slate-900">
            {formatDuration(dive.duration_s)}
          </p>
        </div>
        <div className="panel-surface p-3.5">
          <p className="text-xs text-slate-500">{t('waterTemp')}</p>
          <p className="text-lg font-semibold tabular-telemetry text-slate-900">
            {formatTemp(dive.avg_temp_c ?? dive.min_temp_c, unitSystem)}
          </p>
        </div>
        <div className="panel-surface p-3.5">
          <p className="text-xs text-slate-500">{t('usedPressure')}</p>
          <p className="text-lg font-semibold tabular-telemetry text-slate-900">
            {formatPressure(usedPressureBar, unitSystem)}
          </p>
        </div>
        <div className="panel-surface p-3.5">
          <p className="text-xs text-slate-500">{t('avgSac')}</p>
          <p className="text-lg font-semibold tabular-telemetry text-slate-900">
            {formatSac(dive.sac_l_min, unitSystem)}
          </p>
        </div>
      </div>

      {/* Interactive Dive Profile Curve */}
      <DiveProfileChart
        samples={dive.samples}
        startPressureBar={pStartNum}
        endPressureBar={pEndNum}
      />

      {/* Complete Editable Logbook Form */}
      <form onSubmit={(e) => void handleSubmit(e)} className="panel-surface p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('siteName')}</span>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
            />
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('computerUsed')}</span>
            <input
              type="text"
              value={computerName}
              onChange={(e) => setComputerName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
            />
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('waterType')}</span>
            <select
              value={waterType}
              onChange={(e) => setWaterType(e.target.value as WaterType | '')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
            >
              <option value="">—</option>
              <option value="salt">{t('waterSalt')}</option>
              <option value="fresh">{t('waterFresh')}</option>
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('startPressure')} (bar)</span>
            <input
              type="number"
              step="1"
              value={startPressure}
              onChange={(e) => setStartPressure(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
            />
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('endPressure')} (bar)</span>
            <input
              type="number"
              step="1"
              value={endPressure}
              onChange={(e) => setEndPressure(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
            />
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('tankVolume')} (L)</span>
            <input
              type="number"
              step="0.1"
              value={tankVolume}
              onChange={(e) => setTankVolume(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
            />
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('tankMaterial')}</span>
            <select
              value={tankMaterial}
              onChange={(e) => setTankMaterial(e.target.value as TankMaterial | '')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
            >
              <option value="">—</option>
              <option value="steel">{t('tankSteel')}</option>
              <option value="aluminum">{t('tankAluminum')}</option>
              <option value="composite">{t('tankComposite')}</option>
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('ballast')} (kg)</span>
            <input
              type="number"
              step="0.5"
              value={ballast}
              onChange={(e) => setBallast(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>Gas</span>
              <select
                value={gasType}
                onChange={(e) => setGasType(e.target.value as GasType)}
                className="w-full px-2 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
              >
                <option value="air">{t('gasAir')}</option>
                <option value="nitrox">{t('gasNitrox')}</option>
                <option value="trimix">{t('gasTrimix')}</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>%O2</span>
              <input
                type="number"
                min="10"
                max="100"
                value={o2Pct}
                onChange={(e) => setO2Pct(e.target.value)}
                className="w-full px-2 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>%He</span>
              <input
                type="number"
                min="0"
                max="80"
                value={hePct}
                onChange={(e) => setHePct(e.target.value)}
                className="w-full px-2 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry"
              />
            </label>
          </div>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('decoRequired')}</span>
            <select
              value={deco ? '1' : '0'}
              onChange={(e) => setDeco(e.target.value === '1')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
            >
              <option value="0">{t('no')}</option>
              <option value="1">{t('yes')}</option>
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('decoTime')}</span>
            <input
              type="number"
              min="0"
              disabled={!deco}
              value={decoMinutes}
              onChange={(e) => setDecoMinutes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry disabled:bg-slate-100"
            />
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('visibility')}</span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as RatingScale | '')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
            >
              <option value="">—</option>
              {ratingOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('buoyancy')}</span>
            <select
              value={buoyancy}
              onChange={(e) => setBuoyancy(e.target.value as RatingScale | '')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
            >
              <option value="">—</option>
              {ratingOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('feeling')}</span>
            <select
              value={feeling}
              onChange={(e) => setFeeling(e.target.value as RatingScale | '')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
            >
              <option value="">—</option>
              {ratingOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('buddy')}</span>
            <input
              type="text"
              value={buddy}
              onChange={(e) => setBuddy(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
            />
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700">
            <span>{t('diveCenter')}</span>
            <input
              type="text"
              value={diveCenter}
              onChange={(e) => setDiveCenter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
            />
          </label>

          <label className="space-y-1 text-xs font-medium text-slate-700 sm:col-span-2">
            <span>{t('tags')}</span>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
            />
          </label>
        </div>

        <label className="block space-y-1 text-xs font-medium text-slate-700">
          <span>{t('notes')}</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
          />
        </label>

        <div className="flex items-center justify-between pt-2">
          <div>
            {savedToast && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <Check className="w-4 h-4" />
                {t('savedSuccess')}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={saving || isOffline}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {t('saveChanges')}
          </button>
        </div>
      </form>
    </section>
  );
}

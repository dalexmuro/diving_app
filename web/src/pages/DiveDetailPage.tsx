import {
  AlertCircle,
  ArrowLeft,
  Check,
  Compass,
  MapPin,
  Pencil,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { DiveProfileChart } from '../charts/DiveProfileChart';
import { SmartMultiSelect } from '../components/SmartMultiSelect';
import { SmartSelect } from '../components/SmartSelect';
import { usePreferences } from '../i18n/I18nContext';
import { type GeocodingResult, apiClient } from '../services/api';
import {
  formatDepth,
  formatDuration,
  formatPressure,
  formatSac,
  formatTemp,
} from '../services/units';
import {
  type Buddy,
  type CurrentStrength,
  type DayPeriod,
  type DecoStop,
  type DiveCenter,
  type DiveComputer,
  type DiveDetail,
  type DiveMode,
  type DiveSite,
  type DraftFitInit,
  type GasType,
  type GearItem,
  type RatingScale,
  type SeaState,
  type TankConfig,
  type TankMaterial,
  type TelemetrySample,
  type WaterType,
  type WeatherCondition,
} from '../types/domain';

interface DiveDetailPageProps {
  diveId: string | null; // null = new unsaved draft
  draftFit?: DraftFitInit | null;
  isOffline: boolean;
  onDirtyChange: (dirty: boolean, saveHandler: (() => Promise<boolean>) | null) => void;
  onRequestBack: () => void;
  onSaved: (savedDiveId: string) => Promise<void>;
  onDeleted: () => Promise<void>;
}

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isoToTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function combineDateTimeToIso(dateStr: string, timeStr: string): string {
  const safeDate = dateStr || new Date().toISOString().slice(0, 10);
  const safeTime = timeStr || '10:00';
  const d = new Date(`${safeDate}T${safeTime}:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function DiveDetailPage({
  diveId,
  draftFit,
  isOffline,
  onDirtyChange,
  onRequestBack,
  onSaved,
  onDeleted,
}: DiveDetailPageProps) {
  const { unitSystem, t } = usePreferences();
  const isNewDraft = diveId === null;

  const [dive, setDive] = useState<DiveDetail | null>(null);
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [loading, setLoading] = useState(!isNewDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const [dirty, setDirty] = useState(isNewDraft);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const persistRef = useRef<() => Promise<boolean>>(async () => false);

  // Catalogs for SmartSelect / SmartMultiSelect / Site Search
  const [sitesCatalog, setSitesCatalog] = useState<DiveSite[]>([]);
  const [centers, setCenters] = useState<DiveCenter[]>([]);
  const [buddiesCatalog, setBuddiesCatalog] = useState<Buddy[]>([]);
  const [computersCatalog, setComputersCatalog] = useState<DiveComputer[]>([]);
  const [gearCatalog, setGearCatalog] = useState<GearItem[]>([]);

  // Core editable telemetry & date/time fields
  const [diveDate, setDiveDate] = useState(() => isoToDateInput(draftFit?.parsed.startedAt));
  const [startTime, setStartTime] = useState(() =>
    isoToTimeInput(draftFit?.parsed.startedAt) || '10:00',
  );
  const [endTime, setEndTime] = useState(() => isoToTimeInput(draftFit?.parsed.endedAt));
  const [durationMin, setDurationMin] = useState(() =>
    draftFit ? String(Math.round(draftFit.parsed.durationS / 60)) : '',
  );
  const [maxDepthM, setMaxDepthM] = useState(() =>
    draftFit ? String(draftFit.parsed.maxDepthM) : '',
  );
  const [avgDepthM, setAvgDepthM] = useState(() =>
    draftFit?.parsed.avgDepthM != null ? String(draftFit.parsed.avgDepthM) : '',
  );
  const [minTempC, setMinTempC] = useState(() =>
    draftFit?.parsed.minTempC != null ? String(draftFit.parsed.minTempC) : '',
  );
  const [avgTempC, setAvgTempC] = useState(() =>
    draftFit?.parsed.avgTempC != null ? String(draftFit.parsed.avgTempC) : '',
  );

  // Site & Center + GPS Locations
  const [siteName, setSiteName] = useState(() => draftFit?.parsed.siteDescription ?? '');
  const [siteCountry, setSiteCountry] = useState('');
  const [siteLat, setSiteLat] = useState('');
  const [siteLng, setSiteLng] = useState('');
  const [siteLocked, setSiteLocked] = useState(() => Boolean(draftFit?.parsed.siteDescription));
  const [siteInputMode, setSiteInputMode] = useState<'search' | 'manual'>('search');
  const [draftSiteName, setDraftSiteName] = useState(() => draftFit?.parsed.siteDescription ?? '');
  const [draftSiteCountry, setDraftSiteCountry] = useState('');
  const [draftSiteLat, setDraftSiteLat] = useState('');
  const [draftSiteLng, setDraftSiteLng] = useState('');
  const [siteSearching, setSiteSearching] = useState(false);
  const [siteSearchResults, setSiteSearchResults] = useState<GeocodingResult[]>([]);
  const siteSearchAbortRef = useRef<AbortController | null>(null);
  const [diveCenter, setDiveCenter] = useState('');
  const [centerLocation, setCenterLocation] = useState('');
  const [centerLat, setCenterLat] = useState('');
  const [centerLng, setCenterLng] = useState('');

  // Equipment, Computer, Buddies, Gases, Paliers
  const [computerName, setComputerName] = useState(() => draftFit?.parsed.computerName ?? '');
  const [buddies, setBuddies] = useState<string[]>([]);
  const [gearUsed, setGearUsed] = useState<string[]>([]);
  const [decoStops, setDecoStops] = useState<DecoStop[]>([]);
  const [newStopDepth, setNewStopDepth] = useState('3');
  const [newStopMin, setNewStopMin] = useState('3');

  const [waterType, setWaterType] = useState<WaterType | ''>('');
  const [gasType, setGasType] = useState<GasType>(() => draftFit?.parsed.gasType ?? 'air');
  const [o2Pct, setO2Pct] = useState(() => String(draftFit?.parsed.o2Pct ?? 21));
  const [hePct, setHePct] = useState(() => String(draftFit?.parsed.hePct ?? 0));
  const [startPressure, setStartPressure] = useState(() =>
    draftFit?.parsed.startPressureBar != null ? String(draftFit.parsed.startPressureBar) : '',
  );
  const [endPressure, setEndPressure] = useState(() =>
    draftFit?.parsed.endPressureBar != null ? String(draftFit.parsed.endPressureBar) : '',
  );
  const [tankVolume, setTankVolume] = useState('');
  const [tankMaterial, setTankMaterial] = useState<TankMaterial | ''>('');
  const [tankConfig, setTankConfig] = useState<TankConfig | ''>('');
  const [ballast, setBallast] = useState('');
  const [logNumber, setLogNumber] = useState('');
  const [diveMode, setDiveMode] = useState<DiveMode | ''>('');
  const [diveTypes, setDiveTypes] = useState<string[]>([]);
  const [dayPeriod, setDayPeriod] = useState<DayPeriod | ''>('');
  const [seaState, setSeaState] = useState<SeaState | ''>('');
  const [weather, setWeather] = useState<WeatherCondition | ''>('');
  const [currentStrength, setCurrentStrength] = useState<CurrentStrength | ''>('');
  const [visibility, setVisibility] = useState<RatingScale | ''>('');
  const [buoyancy, setBuoyancy] = useState<RatingScale | ''>('');
  const [feeling, setFeeling] = useState<RatingScale | ''>('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');

  const markDirty = () => setDirty(true);

  // Load catalogs
  useEffect(() => {
    void Promise.all([
      apiClient.fetchSites(),
      apiClient.fetchCenters(),
      apiClient.fetchBuddies(),
      apiClient.fetchComputers(),
      apiClient.fetchGear(),
    ]).then(([s, c, b, comp, g]) => {
      setSitesCatalog(s.data);
      setCenters(c.data);
      setBuddiesCatalog(b.data);
      setComputersCatalog(comp.data);
      setGearCatalog(g.data);
    });
  }, []);

  useEffect(() => () => siteSearchAbortRef.current?.abort(), []);

  // Load existing dive or initialize draft FIT samples
  useEffect(() => {
    if (isNewDraft) {
      setSamples(draftFit?.parsed.samples ?? []);
      setLoading(false);
      setDirty(true);
      return;
    }

    let active = true;
    setLoading(true);
    void apiClient.fetchDiveDetail(diveId).then(({ data }) => {
      if (!active || !data) {
        setLoading(false);
        return;
      }
      setDive(data);
      setSamples(data.samples);
      setDiveDate(isoToDateInput(data.started_at));
      setStartTime(isoToTimeInput(data.started_at));
      setEndTime(isoToTimeInput(data.ended_at));
      setDurationMin(data.duration_s ? String(Math.round(data.duration_s / 60)) : '');
      setMaxDepthM(String(data.max_depth_m));
      setAvgDepthM(data.avg_depth_m != null ? String(data.avg_depth_m) : '');
      setMinTempC(data.min_temp_c != null ? String(data.min_temp_c) : '');
      setAvgTempC(data.avg_temp_c != null ? String(data.avg_temp_c) : '');
      const loadedSiteName = data.site_name ?? '';
      const loadedSiteCountry = data.site_country ?? '';
      const loadedSiteLat = data.site_latitude != null ? String(data.site_latitude) : '';
      const loadedSiteLng = data.site_longitude != null ? String(data.site_longitude) : '';
      setSiteName(loadedSiteName);
      setSiteCountry(loadedSiteCountry);
      setSiteLat(loadedSiteLat);
      setSiteLng(loadedSiteLng);
      setDraftSiteName(loadedSiteName);
      setDraftSiteCountry(loadedSiteCountry);
      setDraftSiteLat(loadedSiteLat);
      setDraftSiteLng(loadedSiteLng);
      setSiteLocked(Boolean(loadedSiteName.trim()));
      setSiteInputMode('search');
      setSiteSearchResults([]);
      setDiveCenter(data.dive_center ?? '');
      setCenterLocation(data.dive_center_location ?? '');
      setCenterLat(data.dive_center_lat != null ? String(data.dive_center_lat) : '');
      setCenterLng(data.dive_center_lng != null ? String(data.dive_center_lng) : '');
      setComputerName(data.computer_name ?? '');
      setWaterType(data.water_type ?? '');
      setGasType(data.gas_type);
      setO2Pct(String(data.o2_pct));
      setHePct(String(data.he_pct));
      setStartPressure(data.start_pressure_bar != null ? String(data.start_pressure_bar) : '');
      setEndPressure(data.end_pressure_bar != null ? String(data.end_pressure_bar) : '');
      setTankVolume(data.tank_volume_l != null ? String(data.tank_volume_l) : '');
      setTankMaterial(data.tank_material ?? '');
      setTankConfig(data.tank_config ?? '');
      setBallast(data.ballast_kg != null ? String(data.ballast_kg) : '');
      setLogNumber(data.log_number != null ? String(data.log_number) : '');
      setDiveMode(data.dive_mode ?? '');
      setDayPeriod(data.day_period ?? '');
      setSeaState(data.sea_state ?? '');
      setWeather(data.weather ?? '');
      setCurrentStrength(data.current_strength ?? '');
      setVisibility(data.visibility ?? '');
      setBuoyancy(data.buoyancy ?? '');
      setFeeling(data.feeling ?? '');
      setNotes(data.notes ?? '');

      try {
        setTags((JSON.parse(data.tags_json || '[]') as string[]).join(', '));
      } catch {
        setTags('');
      }
      try {
        setDiveTypes(JSON.parse(data.dive_types_json || '[]') as string[]);
      } catch {
        setDiveTypes([]);
      }
      try {
        const parsedBuddies = JSON.parse(data.buddies_json || '[]') as string[];
        setBuddies(
          parsedBuddies.length > 0
            ? parsedBuddies
            : data.buddy
              ? data.buddy
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
        );
      } catch {
        setBuddies([]);
      }
      try {
        setGearUsed(JSON.parse(data.gear_used_json || '[]') as string[]);
      } catch {
        setGearUsed([]);
      }
      try {
        const parsedStops = JSON.parse(data.deco_stops_json || '[]') as DecoStop[];
        setDecoStops(parsedStops);
      } catch {
        setDecoStops([]);
      }

      setDirty(false);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [diveId, isNewDraft, draftFit]);

  async function persistDive(): Promise<boolean> {
    if (isOffline) return false;
    setSaving(true);
    setSaveError(null);
    setSavedToast(false);
    try {
      const startedIso = combineDateTimeToIso(diveDate, startTime);
      const durationSec = Math.max(0, Math.round((Number(durationMin) || 0) * 60));
      const endedIso = endTime
        ? combineDateTimeToIso(diveDate, endTime)
        : durationSec > 0
          ? new Date(new Date(startedIso).getTime() + durationSec * 1000).toISOString()
          : null;

      const payload: Record<string, unknown> = {
        started_at: startedIso,
        ended_at: endedIso,
        duration_s: durationSec,
        max_depth_m: Number(maxDepthM) || 0,
        avg_depth_m: avgDepthM ? Number(avgDepthM) : null,
        min_temp_c: minTempC ? Number(minTempC) : null,
        avg_temp_c: avgTempC ? Number(avgTempC) : null,
        site_name: siteName.trim(),
        site_country: siteCountry.trim() || null,
        site_latitude: siteLat ? Number(siteLat) : null,
        site_longitude: siteLng ? Number(siteLng) : null,
        dive_center: diveCenter.trim() || null,
        dive_center_location: centerLocation.trim() || null,
        dive_center_lat: centerLat ? Number(centerLat) : null,
        dive_center_lng: centerLng ? Number(centerLng) : null,
        computer_name: computerName.trim() || null,
        buddies,
        gear_used: gearUsed,
        deco_stops: decoStops,
        water_type: waterType || null,
        gas_type: gasType,
        o2_pct: Number(o2Pct) || 21,
        he_pct: Number(hePct) || 0,
        start_pressure_bar: startPressure ? Number(startPressure) : null,
        end_pressure_bar: endPressure ? Number(endPressure) : null,
        tank_volume_l: tankVolume ? Number(tankVolume) : null,
        tank_material: tankMaterial || null,
        tank_config: tankConfig || null,
        ballast_kg: ballast ? Number(ballast) : null,
        dive_mode: diveMode || null,
        dive_types: diveTypes,
        day_period: dayPeriod || null,
        sea_state: seaState || null,
        weather: weather || null,
        current_strength: currentStrength || null,
        visibility: visibility || null,
        buoyancy: buoyancy || null,
        feeling: feeling || null,
        tags: tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        notes: notes.trim() || null,
      };

      let savedDive: DiveDetail;
      if (isNewDraft) {
        if (draftFit) {
          payload.samples = draftFit.parsed.samples;
          payload.fit_hash = draftFit.parsed.fitHash;
          payload.fit_base64 = draftFit.fitBase64;
          payload.gf_low = draftFit.parsed.gfLow;
          payload.gf_high = draftFit.parsed.gfHigh;
          payload.dive_number_in_series = draftFit.parsed.diveNumberInSeries;
          payload.surface_time_s = draftFit.parsed.surfaceTimeS;
        }
        savedDive = await apiClient.createDive(payload);
      } else {
        savedDive = await apiClient.updateDive(diveId, payload);
      }

      setDive(savedDive);
      setLogNumber(savedDive.log_number != null ? String(savedDive.log_number) : '');
      setDirty(false);
      await onSaved(savedDive.id);
      setSavedToast(true);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => setSavedToast(false), 2500);
      return true;
    } catch {
      setSaveError(t('saveErrorGeneric'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  persistRef.current = persistDive;

  // Clean up toast timer on unmount
  useEffect(
    () => () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  // Expose dirty status & stable save handler ONLY when dirty actually toggles (prevents 2x App re-renders per keystroke)
  useEffect(() => {
    onDirtyChange(dirty, dirty ? () => persistRef.current() : null);
    return () => onDirtyChange(false, null);
  }, [dirty, onDirtyChange]);

  // Ctrl/Cmd+S keyboard shortcut to save quickly
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!saving && !isOffline) {
          void persistRef.current();
        }
      } else if (e.key === 'Escape' && confirmDeleteOpen) {
        setConfirmDeleteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saving, isOffline, confirmDeleteOpen]);

  // Lock body scroll when delete modal is open
  useEffect(() => {
    if (!confirmDeleteOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [confirmDeleteOpen]);

  const matchingSavedSites = useMemo(() => {
    const q = draftSiteName.trim().toLowerCase();
    if (!q) return [];
    return sitesCatalog
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.country && s.country.toLowerCase().includes(q)),
      )
      .slice(0, 5);
  }, [sitesCatalog, draftSiteName]);

  async function handleSiteSearch() {
    const q = draftSiteName.trim();
    if (isOffline || !q) return;
    siteSearchAbortRef.current?.abort();
    const controller = new AbortController();
    siteSearchAbortRef.current = controller;
    setSiteSearching(true);
    try {
      const found = await apiClient.searchLocation(q, controller.signal);
      if (!controller.signal.aborted) {
        setSiteSearchResults(found);
      }
    } catch {
      // Ignore aborted requests
    } finally {
      if (!controller.signal.aborted) {
        setSiteSearching(false);
      }
    }
  }

  function handleSelectSavedSite(site: DiveSite) {
    setDraftSiteName(site.name);
    setDraftSiteCountry(site.country ?? '');
    setDraftSiteLat(site.latitude != null ? String(site.latitude) : '');
    setDraftSiteLng(site.longitude != null ? String(site.longitude) : '');
    setSiteSearchResults([]);
  }

  function handleSelectGeoResult(r: GeocodingResult) {
    const parts = r.displayName
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    setDraftSiteName(parts[0] || r.displayName);
    setDraftSiteCountry(parts.length > 1 ? parts[parts.length - 1] : '');
    setDraftSiteLat(String(r.latitude));
    setDraftSiteLng(String(r.longitude));
    setSiteSearchResults([]);
  }

  function handleCommitSite() {
    const clean = draftSiteName.trim();
    if (!clean) return;
    setSiteName(clean);
    setSiteCountry(draftSiteCountry.trim());
    setSiteLat(draftSiteLat.trim());
    setSiteLng(draftSiteLng.trim());
    setSiteLocked(true);
    setSiteSearchResults([]);
    markDirty();
  }

  function handleEditSite() {
    setDraftSiteName(siteName);
    setDraftSiteCountry(siteCountry);
    setDraftSiteLat(siteLat);
    setDraftSiteLng(siteLng);
    setSiteInputMode('manual');
    setSiteLocked(false);
    setSiteSearchResults([]);
  }

  function handleClearSite() {
    setSiteName('');
    setSiteCountry('');
    setSiteLat('');
    setSiteLng('');
    setDraftSiteName('');
    setDraftSiteCountry('');
    setDraftSiteLat('');
    setDraftSiteLng('');
    setSiteInputMode('search');
    setSiteLocked(false);
    setSiteSearchResults([]);
    markDirty();
  }

  function handleCenterSelect(val: string) {
    setDiveCenter(val);
    markDirty();
    const matched = centers.find((c) => c.name.toLowerCase() === val.trim().toLowerCase());
    if (matched) {
      if (matched.location_text) setCenterLocation(matched.location_text);
      if (matched.latitude != null) setCenterLat(String(matched.latitude));
      if (matched.longitude != null) setCenterLng(String(matched.longitude));
    }
  }

  function addDecoStop() {
    const d = Number(newStopDepth);
    const m = Number(newStopMin);
    if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(m) || m <= 0) return;
    setDecoStops((prev) => [...prev, { depth_m: d, duration_min: m }]);
    markDirty();
  }

  async function handleConfirmDelete() {
    if (!diveId || isOffline) return;
    await apiClient.deleteDive(diveId);
    setDirty(false);
    setConfirmDeleteOpen(false);
    await onDeleted();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-slate-200 animate-pulse" />
        <div className="h-64 rounded-xl bg-slate-200 animate-pulse" />
      </div>
    );
  }

  // Explicit offline empty state when a dive detail was never cached locally
  if (!isNewDraft && !dive) {
    return (
      <section className="space-y-5">
        <button
          type="button"
          onClick={onRequestBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('backToLogbook')}
        </button>
        <div className="panel-surface p-8 text-center space-y-3 max-w-md mx-auto">
          <WifiOff className="w-8 h-8 text-amber-600 mx-auto" />
          <p className="text-sm text-slate-700">{t('offlineDiveNotCached')}</p>
        </div>
      </section>
    );
  }

  const pStartNum = startPressure ? Number(startPressure) : null;
  const pEndNum = endPressure ? Number(endPressure) : null;
  const usedPressureBar =
    pStartNum != null && pEndNum != null && pStartNum >= pEndNum ? pStartNum - pEndNum : null;
  const currentDurationS = Math.max(0, Math.round((Number(durationMin) || 0) * 60));

  const ratingOptions: Array<{ value: RatingScale; label: string }> = [
    { value: 'poor', label: t('ratingPoor') },
    { value: 'normal', label: t('ratingNormal') },
    { value: 'good', label: t('ratingGood') },
    { value: 'excellent', label: t('ratingExcellent') },
  ];

  const additionalTypeOptions: Array<{ id: string; label: string }> = [
    { id: 'cave', label: t('diveTypeCave') },
    { id: 'wreck', label: t('diveTypeWreck') },
    { id: 'photo_bio', label: t('diveTypePhotoBio') },
    { id: 'night', label: t('diveTypeNight') },
  ];

  const entryType = diveTypes.includes('boat')
    ? 'boat'
    : diveTypes.includes('shore')
      ? 'shore'
      : '';

  const explorationLabels = diveTypes
    .filter((x) => x !== 'shore' && x !== 'boat')
    .map((id) => additionalTypeOptions.find((o) => o.id === id)?.label ?? id);

  function setEntryType(next: '' | 'shore' | 'boat') {
    setDiveTypes((prev) => {
      const withoutEntry = prev.filter((x) => x !== 'shore' && x !== 'boat');
      return next ? [...withoutEntry, next] : withoutEntry;
    });
    markDirty();
  }

  function handleExplorationChange(nextLabels: string[]) {
    const mapped = nextLabels.map((lbl) => {
      const match = additionalTypeOptions.find(
        (o) => o.label.toLowerCase() === lbl.trim().toLowerCase(),
      );
      return match ? match.id : lbl.trim();
    });
    setDiveTypes((prev) => {
      const entryOnly = prev.filter((x) => x === 'shore' || x === 'boat');
      return [...entryOnly, ...mapped];
    });
    markDirty();
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onRequestBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('backToLogbook')}
        </button>

        {!isNewDraft && !isOffline && (
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium px-3 py-1.5 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('deleteDive')}
          </button>
        )}
      </div>

      {/* Live Telemetry Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="panel-surface p-3.5">
          <p className="text-xs text-slate-500">{t('maxDepth')}</p>
          <p className="text-lg font-semibold tabular-telemetry text-slate-900">
            {formatDepth(maxDepthM ? Number(maxDepthM) : null, unitSystem)}
          </p>
        </div>
        <div className="panel-surface p-3.5">
          <p className="text-xs text-slate-500">{t('avgDepth')}</p>
          <p className="text-lg font-semibold tabular-telemetry text-slate-900">
            {formatDepth(avgDepthM ? Number(avgDepthM) : null, unitSystem)}
          </p>
        </div>
        <div className="panel-surface p-3.5">
          <p className="text-xs text-slate-500">{t('underwaterTime')}</p>
          <p className="text-lg font-semibold tabular-telemetry text-slate-900">
            {formatDuration(currentDurationS)}
          </p>
        </div>
        <div className="panel-surface p-3.5">
          <p className="text-xs text-slate-500">{t('waterTemp')}</p>
          <p className="text-lg font-semibold tabular-telemetry text-slate-900">
            {formatTemp(
              avgTempC ? Number(avgTempC) : minTempC ? Number(minTempC) : null,
              unitSystem,
            )}
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
            {formatSac(dive?.sac_l_min ?? null, unitSystem)}
          </p>
        </div>
      </div>

      {/* Interactive Suunto DM5-Style Dive Profile */}
      <DiveProfileChart
        samples={samples}
        totalDurationS={currentDurationS || undefined}
        startPressureBar={pStartNum}
        endPressureBar={pEndNum}
        decoStops={decoStops}
      />

      {/* Complete Editable Dive Form — 3 visually distinct sections */}
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void persistDive();
        }}
        className="space-y-5"
      >
        {/* SECTION 1: Location & Dive Center */}
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-sky-200/70 pb-2.5">
            <MapPin className="w-4 h-4 text-sky-700" />
            <h2 className="text-sm font-semibold text-slate-900">{t('sectionLocationCenter')}</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* Unified Site Selector (Search / Manual / Locked Registered State) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">{t('siteName')}</span>
                {!siteLocked && (
                  <button
                    type="button"
                    onClick={() => {
                      setSiteInputMode((prev) => (prev === 'search' ? 'manual' : 'search'));
                      setSiteSearchResults([]);
                    }}
                    className="text-xs font-medium text-sky-700 hover:text-sky-900 cursor-pointer"
                  >
                    {siteInputMode === 'search' ? t('siteManualMode') : t('siteSearchMode')}
                  </button>
                )}
              </div>

              {siteLocked ? (
                <div className="rounded-xl border border-sky-200 bg-white px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {siteName}
                      {siteCountry ? ` · ${siteCountry}` : ''}
                    </p>
                    <p className="text-xs text-slate-500 inline-flex items-center gap-1 tabular-telemetry">
                      <MapPin className="w-3 h-3 text-sky-600 shrink-0" />
                      {siteLat && siteLng ? `${siteLat}, ${siteLng}` : 'GPS —'}
                    </p>
                  </div>
                  {!isOffline && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={handleEditSite}
                        aria-label={t('edit')}
                        title={t('edit')}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-slate-700 hover:text-sky-800 px-2.5 py-1.5 text-xs font-medium cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t('edit')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleClearSite}
                        aria-label={t('delete')}
                        title={t('delete')}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-red-700 px-2.5 py-1.5 text-xs font-medium cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t('delete')}</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : siteInputMode === 'search' ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1 min-w-0">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={draftSiteName}
                        onChange={(e) => setDraftSiteName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleSiteSearch();
                          }
                        }}
                        placeholder={t('siteSearchPlaceholder')}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                      />
                    </div>
                    {!isOffline && (
                      <button
                        type="button"
                        disabled={siteSearching || !draftSiteName.trim()}
                        onClick={() => void handleSiteSearch()}
                        className="rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-800 text-xs font-medium px-3.5 py-2 cursor-pointer shrink-0"
                      >
                        {siteSearching ? '...' : t('searchLocationBtn')}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!draftSiteName.trim()}
                      onClick={handleCommitSite}
                      className="inline-flex items-center gap-1 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium px-3.5 py-2 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('siteAddBtn')}</span>
                    </button>
                  </div>

                  {(draftSiteLat || draftSiteLng) && (
                    <p className="text-xs text-sky-800 inline-flex items-center gap-1 tabular-telemetry">
                      <MapPin className="w-3 h-3 text-sky-600 shrink-0" />
                      {draftSiteLat}, {draftSiteLng}
                      {draftSiteCountry ? ` · ${draftSiteCountry}` : ''}
                    </p>
                  )}

                  {(matchingSavedSites.length > 0 || siteSearchResults.length > 0) && (
                    <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 max-h-48 overflow-y-auto shadow-sm">
                      {matchingSavedSites.map((s) => (
                        <li key={`saved-${s.id}`}>
                          <button
                            type="button"
                            onClick={() => handleSelectSavedSite(s)}
                            className="w-full text-left px-3 py-2 text-xs text-slate-800 hover:bg-sky-50 flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <span className="truncate font-medium">
                              {s.name}
                              {s.country ? ` · ${s.country}` : ''}
                            </span>
                            <span className="shrink-0 rounded-full bg-sky-100 text-sky-800 px-2 py-0.5 text-[10px] font-semibold">
                              {t('siteSavedCatalogBadge')}
                            </span>
                          </button>
                        </li>
                      ))}
                      {siteSearchResults.map((r) => (
                        <li key={`geo-${r.latitude},${r.longitude}`}>
                          <button
                            type="button"
                            onClick={() => handleSelectGeoResult(r)}
                            className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-sky-50 flex items-start gap-2 cursor-pointer"
                          >
                            <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                            <span className="leading-snug">{r.displayName}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={draftSiteName}
                    onChange={(e) => setDraftSiteName(e.target.value)}
                    placeholder={t('siteName')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <input
                      type="number"
                      step="any"
                      placeholder="Latitude"
                      value={draftSiteLat}
                      onChange={(e) => setDraftSiteLat(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Longitude"
                      value={draftSiteLng}
                      onChange={(e) => setDraftSiteLng(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
                    />
                    <button
                      type="button"
                      disabled={!draftSiteName.trim()}
                      onClick={handleCommitSite}
                      className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium px-3.5 py-2 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('siteAddBtn')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <SmartSelect
              label={t('diveCenter')}
              value={diveCenter}
              options={centers.map((c) => c.name)}
              placeholder={t('selectOrType')}
              onChange={handleCenterSelect}
            />
          </div>
        </div>

        {/* SECTION 2: Basic Information */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <Compass className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-semibold text-slate-900">{t('sectionBasicInfo')}</h2>
          </div>

          {/* Row 1: Auto Dive #, Date, Start Time, End Time, Duration */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('logNumber')}</span>
              <div className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-sm font-semibold tabular-telemetry text-slate-600 select-none">
                {logNumber ? `N° ${logNumber}` : t('siteAutoNumber')}
              </div>
            </div>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('dateLabel')}</span>
              <input
                type="date"
                required
                value={diveDate}
                onChange={(e) => {
                  setDiveDate(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('startTimeLabel')}</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('endTimeLabel')}</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('durationMin')}</span>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={durationMin}
                onChange={(e) => {
                  setDurationMin(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
              />
            </label>
          </div>

          {/* Row 2: Modality, Entry Type, Exploration Type (editable list) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('diveMode')}</span>
              <select
                value={diveMode}
                onChange={(e) => {
                  setDiveMode(e.target.value as DiveMode | '');
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
              >
                <option value="">—</option>
                <option value="guided">{t('modeGuided')}</option>
                <option value="autonomous">{t('modeAutonomous')}</option>
                <option value="training">{t('modeTraining')}</option>
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('diveEntryTitle')}</span>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value as '' | 'shore' | 'boat')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
              >
                <option value="">—</option>
                <option value="shore">{t('diveTypeShore')}</option>
                <option value="boat">{t('diveTypeBoat')}</option>
              </select>
            </label>

            <SmartMultiSelect
              label={t('diveTypesTitle')}
              values={explorationLabels}
              options={additionalTypeOptions.map((o) => o.label)}
              placeholder={t('selectOrType')}
              addLabel={t('addOption')}
              onChange={handleExplorationChange}
            />
          </div>

          {/* Row 3: Max Depth, Avg Depth, Min Temp, Avg Temp */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('maxDepth')} (m)</span>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={maxDepthM}
                onChange={(e) => {
                  setMaxDepthM(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('avgDepth')} (m)</span>
              <input
                type="number"
                min="0"
                step="any"
                value={avgDepthM}
                onChange={(e) => {
                  setAvgDepthM(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('minTemp')}</span>
              <input
                type="number"
                step="any"
                value={minTempC}
                onChange={(e) => {
                  setMinTempC(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('avgTemp')}</span>
              <input
                type="number"
                step="any"
                value={avgTempC}
                onChange={(e) => {
                  setAvgTempC(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
              />
            </label>
          </div>

          {/* Paliers / Deco Stops */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">{t('decoStopsTitle')}</h3>

            {decoStops.length === 0 ? (
              <p className="text-xs text-slate-500">{t('noDecoStops')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {decoStops.map((stop, idx) => (
                  <span
                    key={`${stop.depth_m}-${stop.duration_min}-${idx}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 tabular-telemetry"
                  >
                    {formatDepth(stop.depth_m, unitSystem)} · {stop.duration_min} min
                    <button
                      type="button"
                      aria-label={t('delete')}
                      onClick={() => {
                        setDecoStops((prev) => prev.filter((_, i) => i !== idx));
                        markDirty();
                      }}
                      className="text-violet-600 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 sm:max-w-md gap-2 items-end">
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('stopDepthM')}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="any"
                  value={newStopDepth}
                  onChange={(e) => setNewStopDepth(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('stopDurationMin')}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={newStopMin}
                  onChange={(e) => setNewStopMin(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
                />
              </label>
              <button
                type="button"
                onClick={addDecoStop}
                className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-xs font-medium px-3 py-2 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-violet-600" />
                <span>{t('addDecoStop')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 3: Complementary Information */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-5 space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <SlidersHorizontal className="w-4 h-4 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-900">{t('sectionExtraInfo')}</h2>
          </div>

          {/* Computer, Buddies & Gear */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SmartSelect
              label={t('computerUsed')}
              value={computerName}
              options={computersCatalog.map((c) => c.name)}
              placeholder={t('selectOrType')}
              onChange={(val) => {
                setComputerName(val);
                markDirty();
              }}
            />

            <SmartMultiSelect
              label={t('buddy')}
              values={buddies}
              options={buddiesCatalog.map((b) => b.name)}
              placeholder={t('selectOrType')}
              addLabel={t('addOption')}
              onChange={(vals) => {
                setBuddies(vals);
                markDirty();
              }}
            />

            <SmartMultiSelect
              label={t('gearUsed')}
              values={gearUsed}
              options={gearCatalog.map((g) => g.name)}
              placeholder={t('selectOrType')}
              addLabel={t('addOption')}
              onChange={(vals) => {
                setGearUsed(vals);
                markDirty();
              }}
            />
          </div>

          {/* Sub-block: Tank, Pressures & Gas */}
          <div className="space-y-3 pt-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('subSectionTankGas')}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('startPressure')} (bar)</span>
              <input
                type="number"
                step="any"
                value={startPressure}
                onChange={(e) => {
                  setStartPressure(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('endPressure')} (bar)</span>
              <input
                type="number"
                step="any"
                value={endPressure}
                onChange={(e) => {
                  setEndPressure(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('tankVolume')} (L)</span>
              <input
                type="number"
                step="any"
                value={tankVolume}
                onChange={(e) => {
                  setTankVolume(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('tankMaterial')}</span>
              <select
                value={tankMaterial}
                onChange={(e) => {
                  setTankMaterial(e.target.value as TankMaterial | '');
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
              >
                <option value="">—</option>
                <option value="steel">{t('tankSteel')}</option>
                <option value="aluminum">{t('tankAluminum')}</option>
                <option value="composite">{t('tankComposite')}</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('tankConfig')}</span>
              <select
                value={tankConfig}
                onChange={(e) => {
                  setTankConfig(e.target.value as TankConfig | '');
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
              >
                <option value="">—</option>
                <option value="single">{t('tankSingle')}</option>
                <option value="double">{t('tankDouble')}</option>
                <option value="sidemount">{t('tankSidemount')}</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('ballast')} (kg)</span>
              <input
                type="number"
                step="any"
                value={ballast}
                onChange={(e) => {
                  setBallast(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('waterType')}</span>
              <select
                value={waterType}
                onChange={(e) => {
                  setWaterType(e.target.value as WaterType | '');
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
              >
                <option value="">—</option>
                <option value="salt">{t('waterSalt')}</option>
                <option value="fresh">{t('waterFresh')}</option>
                <option value="pool">{t('waterPool')}</option>
              </select>
            </label>

            <div className="grid grid-cols-3 gap-1.5 col-span-2">
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>Gas</span>
                <select
                  value={gasType}
                  onChange={(e) => {
                    setGasType(e.target.value as GasType);
                    markDirty();
                  }}
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
                  onChange={(e) => {
                    setO2Pct(e.target.value);
                    markDirty();
                  }}
                  className="w-full px-2 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>%He</span>
                <input
                  type="number"
                  min="0"
                  max="80"
                  value={hePct}
                  onChange={(e) => {
                    setHePct(e.target.value);
                    markDirty();
                  }}
                  className="w-full px-2 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry"
                />
              </label>
            </div>
            </div>
          </div>

          {/* Sub-block: Conditions & Notes */}
          <div className="space-y-3 pt-2 border-t border-slate-200/80">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('subSectionConditions')}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('dayPeriod')}</span>
                <select
                  value={dayPeriod}
                  onChange={(e) => {
                    setDayPeriod(e.target.value as DayPeriod | '');
                    markDirty();
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
                >
                  <option value="">—</option>
                  <option value="day">{t('periodDay')}</option>
                  <option value="twilight">{t('periodTwilight')}</option>
                  <option value="night">{t('periodNight')}</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('seaState')}</span>
                <select
                  value={seaState}
                  onChange={(e) => {
                    setSeaState(e.target.value as SeaState | '');
                    markDirty();
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
                >
                  <option value="">—</option>
                  <option value="calm">{t('seaCalm')}</option>
                  <option value="slight">{t('seaSlight')}</option>
                  <option value="moderate">{t('seaModerate')}</option>
                  <option value="rough">{t('seaRough')}</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('weather')}</span>
                <select
                  value={weather}
                  onChange={(e) => {
                    setWeather(e.target.value as WeatherCondition | '');
                    markDirty();
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
                >
                  <option value="">—</option>
                  <option value="sunny">{t('weatherSunny')}</option>
                  <option value="cloudy">{t('weatherCloudy')}</option>
                  <option value="rainy">{t('weatherRainy')}</option>
                  <option value="windy">{t('weatherWindy')}</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('currentStrength')}</span>
                <select
                  value={currentStrength}
                  onChange={(e) => {
                    setCurrentStrength(e.target.value as CurrentStrength | '');
                    markDirty();
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
                >
                  <option value="">—</option>
                  <option value="none">{t('currentNone')}</option>
                  <option value="weak">{t('currentWeak')}</option>
                  <option value="moderate">{t('currentModerate')}</option>
                  <option value="strong">{t('currentStrong')}</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('visibility')}</span>
              <select
                value={visibility}
                onChange={(e) => {
                  setVisibility(e.target.value as RatingScale | '');
                  markDirty();
                }}
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
                onChange={(e) => {
                  setBuoyancy(e.target.value as RatingScale | '');
                  markDirty();
                }}
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
                onChange={(e) => {
                  setFeeling(e.target.value as RatingScale | '');
                  markDirty();
                }}
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
              <span>{t('tags')}</span>
              <input
                type="text"
                value={tags}
                onChange={(e) => {
                  setTags(e.target.value);
                  markDirty();
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
              />
            </label>
          </div>

          <label className="block space-y-1 text-xs font-medium text-slate-700">
            <span>{t('notes')}</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                markDirty();
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
            />
          </label>
          </div>
        </div>

        {saveError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        {/* True Sticky Save Action Bar when editing */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 transition-shadow ${
            dirty
              ? 'sticky bottom-[calc(4.25rem+var(--safe-bottom))] sm:bottom-3 z-20 bg-white/95 backdrop-blur border border-sky-200 shadow-lg'
              : 'pt-1'
          }`}
        >
          <div aria-live="polite" className="min-h-5 flex items-center">
            {savedToast ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <Check className="w-4 h-4" />
                {t('savedSuccess')}
              </span>
            ) : dirty ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {t('unsavedChangesBadge')}
              </span>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={saving || isOffline}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? '...' : isNewDraft ? t('saveDive') : t('saveChanges')}
          </button>
        </div>
      </form>

      {/* Delete Confirmation — Bottom Sheet on mobile, Dialog on sm+ */}
      {confirmDeleteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dive-title"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4"
        >
          <div className="bg-white rounded-t-2xl sm:rounded-xl border border-slate-200 max-w-sm w-full p-5 pb-[max(1.25rem,var(--safe-bottom))] sm:pb-5 max-h-[85dvh] overflow-y-auto space-y-4 shadow-xl">
            <h2 id="delete-dive-title" className="text-base font-semibold text-slate-900">
              {t('deleteDive')}
            </h2>
            <p className="text-sm text-slate-600">{t('confirmDeleteDive')}</p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                className="rounded-lg border border-slate-300 px-3.5 py-2.5 sm:py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                className="rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 px-3.5 py-2.5 sm:py-2 text-xs font-medium text-white cursor-pointer"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

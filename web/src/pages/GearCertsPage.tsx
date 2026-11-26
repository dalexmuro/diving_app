import { Backpack, Building2, Cpu, MapPin, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { LocationPicker } from '../components/LocationPicker';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';
import {
  type Buddy,
  type DiveCenter,
  type DiveComputer,
  type GearItem,
} from '../types/domain';

interface GearCertsPageProps {
  isOffline: boolean;
}

type CatalogTab = 'gear' | 'centers' | 'buddies' | 'computers';

export function GearCertsPage({ isOffline }: GearCertsPageProps) {
  const { t } = usePreferences();
  const [tab, setTab] = useState<CatalogTab>('gear');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [gear, setGear] = useState<GearItem[]>([]);
  const [centers, setCenters] = useState<DiveCenter[]>([]);
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [computers, setComputers] = useState<DiveComputer[]>([]);

  // Gear form (Name, Brand, Model, Notes)
  const [gearId, setGearId] = useState<string | undefined>(undefined);
  const [gearName, setGearName] = useState('');
  const [gearBrand, setGearBrand] = useState('');
  const [gearModel, setGearModel] = useState('');
  const [gearNotes, setGearNotes] = useState('');

  // Centers form
  const [centerId, setCenterId] = useState<string | undefined>(undefined);
  const [centerName, setCenterName] = useState('');
  const [centerLoc, setCenterLoc] = useState('');
  const [centerLat, setCenterLat] = useState('');
  const [centerLng, setCenterLng] = useState('');
  const [centerNotes, setCenterNotes] = useState('');

  // Buddies form
  const [buddyId, setBuddyId] = useState<string | undefined>(undefined);
  const [buddyName, setBuddyName] = useState('');
  const [buddyNotes, setBuddyNotes] = useState('');

  // Computers form
  const [compId, setCompId] = useState<string | undefined>(undefined);
  const [compName, setCompName] = useState('');
  const [compBrand, setCompBrand] = useState('');
  const [compModel, setCompModel] = useState('');
  const [compNotes, setCompNotes] = useState('');

  async function reloadCatalog(target: CatalogTab) {
    switch (target) {
      case 'gear':
        setGear((await apiClient.fetchGear()).data);
        break;
      case 'centers':
        setCenters((await apiClient.fetchCenters()).data);
        break;
      case 'buddies':
        setBuddies((await apiClient.fetchBuddies()).data);
        break;
      case 'computers':
        setComputers((await apiClient.fetchComputers()).data);
        break;
    }
  }

  useEffect(() => {
    void Promise.all([
      apiClient.fetchGear(),
      apiClient.fetchCenters(),
      apiClient.fetchBuddies(),
      apiClient.fetchComputers(),
    ]).then(([g, c, b, comp]) => {
      setGear(g.data);
      setCenters(c.data);
      setBuddies(b.data);
      setComputers(comp.data);
    });
  }, []);

  function resetGearForm() {
    setGearId(undefined);
    setGearName('');
    setGearBrand('');
    setGearModel('');
    setGearNotes('');
  }

  function resetCenterForm() {
    setCenterId(undefined);
    setCenterName('');
    setCenterLoc('');
    setCenterLat('');
    setCenterLng('');
    setCenterNotes('');
  }

  function resetBuddyForm() {
    setBuddyId(undefined);
    setBuddyName('');
    setBuddyNotes('');
  }

  function resetCompForm() {
    setCompId(undefined);
    setCompName('');
    setCompBrand('');
    setCompModel('');
    setCompNotes('');
  }

  async function handleSaveGear(e: FormEvent) {
    e.preventDefault();
    if (isOffline || !gearName.trim()) return;
    await apiClient.saveGear({
      id: gearId,
      name: gearName.trim(),
      brand: gearBrand.trim() || null,
      model: gearModel.trim() || null,
      notes: gearNotes.trim() || null,
    });
    resetGearForm();
    await reloadCatalog('gear');
  }

  async function handleSaveCenter(e: FormEvent) {
    e.preventDefault();
    if (isOffline || !centerName.trim()) return;
    await apiClient.saveCenter({
      id: centerId,
      name: centerName.trim(),
      location_text: centerLoc.trim() || null,
      latitude: centerLat ? Number(centerLat) : null,
      longitude: centerLng ? Number(centerLng) : null,
      notes: centerNotes.trim() || null,
    });
    resetCenterForm();
    await reloadCatalog('centers');
  }

  async function handleSaveBuddy(e: FormEvent) {
    e.preventDefault();
    if (isOffline || !buddyName.trim()) return;
    await apiClient.saveBuddy({
      id: buddyId,
      name: buddyName.trim(),
      notes: buddyNotes.trim() || null,
    });
    resetBuddyForm();
    await reloadCatalog('buddies');
  }

  async function handleSaveComputer(e: FormEvent) {
    e.preventDefault();
    if (isOffline || !compName.trim()) return;
    await apiClient.saveComputer({
      id: compId,
      name: compName.trim(),
      brand: compBrand.trim() || null,
      model: compModel.trim() || null,
      notes: compNotes.trim() || null,
    });
    resetCompForm();
    await reloadCatalog('computers');
  }

  async function executeDelete(kind: CatalogTab, id: string) {
    setConfirmDeleteId(null);
    if (kind === 'gear') await apiClient.deleteGear(id);
    else if (kind === 'centers') await apiClient.deleteCenter(id);
    else if (kind === 'buddies') await apiClient.deleteBuddy(id);
    else if (kind === 'computers') await apiClient.deleteComputer(id);
    await reloadCatalog(kind);
  }

  const tabs: Array<{ id: CatalogTab; label: string; count: number }> = [
    { id: 'gear', label: t('gearTitle'), count: gear.length },
    { id: 'centers', label: t('centersTitle'), count: centers.length },
    { id: 'buddies', label: t('buddiesTitle'), count: buddies.length },
    { id: 'computers', label: t('computersTitle'), count: computers.length },
  ];

  function renderRowActions(kind: CatalogTab, id: string, onEdit: () => void) {
    if (isOffline) return null;
    if (confirmDeleteId === id) {
      return (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setConfirmDeleteId(null)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => void executeDelete(kind, id)}
            className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-medium text-white cursor-pointer"
          >
            {t('delete')}
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          aria-label={t('edit')}
          onClick={onEdit}
          className="touch-target flex items-center justify-center rounded-lg text-slate-500 hover:text-sky-700 hover:bg-sky-50 active:bg-sky-100 cursor-pointer"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label={t('delete')}
          onClick={() => setConfirmDeleteId(id)}
          className="touch-target flex items-center justify-center rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 active:bg-red-100 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <h1 className="text-[clamp(1.35rem,2.5vw,1.6rem)] font-semibold tracking-tight text-slate-900">
        {t('navGearCerts')}
      </h1>

      {/* Scrollable horizontal tabs on mobile, wrapped on sm+ */}
      <div
        role="tablist"
        aria-label={t('navGearCerts')}
        className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
      >
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(item.id);
                setConfirmDeleteId(null);
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                active
                  ? 'bg-sky-600 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}{' '}
              <span className="opacity-80 tabular-telemetry">({item.count})</span>
            </button>
          );
        })}
      </div>

      {/* 1. Gear (Name, Brand, Model, Notes) */}
      {tab === 'gear' && (
        <div className="panel-surface p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">{t('gearTitle')}</h2>
            {gearId && (
              <button
                type="button"
                onClick={resetGearForm}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                {t('editingLabel')} · {t('cancel')}
              </button>
            )}
          </div>
          {!isOffline && (
            <form
              onSubmit={(e) => void handleSaveGear(e)}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
            >
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('gearName')}</span>
                <input
                  type="text"
                  required
                  value={gearName}
                  onChange={(e) => setGearName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('gearBrand')}</span>
                <input
                  type="text"
                  value={gearBrand}
                  onChange={(e) => setGearBrand(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('gearModel')}</span>
                <input
                  type="text"
                  value={gearModel}
                  onChange={(e) => setGearModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('notes')}</span>
                <input
                  type="text"
                  value={gearNotes}
                  onChange={(e) => setGearNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
              </label>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-sm font-medium px-3 py-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {gearId ? t('saveChanges') : t('addGear')}
              </button>
            </form>
          )}
          <ul className="space-y-2.5">
            {gear.map((item) => {
              const subtitle = [item.brand, item.model].filter(Boolean).join(' · ') || item.brand_model || '';
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-sky-200/75 bg-sky-50/35 hover:bg-sky-50/75 transition-colors px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-lg bg-sky-100/90 text-sky-700 inline-flex items-center justify-center shrink-0">
                      <Backpack className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                      {(subtitle || item.notes) && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {[subtitle, item.notes].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  {renderRowActions('gear', item.id, () => {
                    setGearId(item.id);
                    setGearName(item.name);
                    setGearBrand(item.brand ?? '');
                    setGearModel(item.model ?? '');
                    setGearNotes(item.notes ?? '');
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 2. Dive Centers */}
      {tab === 'centers' && (
        <div className="panel-surface p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">{t('centersTitle')}</h2>
            {centerId && (
              <button
                type="button"
                onClick={resetCenterForm}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                {t('editingLabel')} · {t('cancel')}
              </button>
            )}
          </div>
          {!isOffline && (
            <form onSubmit={(e) => void handleSaveCenter(e)} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1 text-xs font-medium text-slate-700">
                  <span>{t('diveCenter')}</span>
                  <input
                    type="text"
                    required
                    value={centerName}
                    onChange={(e) => setCenterName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-slate-700">
                  <span>{t('notes')}</span>
                  <input
                    type="text"
                    value={centerNotes}
                    onChange={(e) => setCenterNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                  />
                </label>
              </div>
              <LocationPicker
                label={t('centerLocation')}
                locationText={centerLoc}
                latitude={centerLat}
                longitude={centerLng}
                isOffline={isOffline}
                showLocationText
                onChange={(patch) => {
                  if (patch.locationText !== undefined) setCenterLoc(patch.locationText);
                  if (patch.latitude !== undefined) setCenterLat(patch.latitude);
                  if (patch.longitude !== undefined) setCenterLng(patch.longitude);
                }}
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-sm font-medium px-4 py-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {centerId ? t('saveChanges') : t('addCenter')}
              </button>
            </form>
          )}
          <ul className="space-y-2.5">
            {centers.map((c) => {
              const coords =
                c.latitude != null && c.longitude != null
                  ? `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`
                  : '';
              const locLine = [c.location_text, coords].filter(Boolean).join(' · ');
              return (
                <li
                  key={c.id}
                  className="rounded-xl border border-sky-200/75 bg-sky-50/35 hover:bg-sky-50/75 transition-colors px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-lg bg-sky-100/90 text-sky-700 inline-flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{c.name}</p>
                      {locLine && (
                        <p className="text-xs text-slate-500 tabular-telemetry inline-flex items-center gap-1 mt-0.5 truncate max-w-full">
                          <MapPin className="w-3 h-3 text-sky-600 shrink-0" />
                          <span className="truncate">{locLine}</span>
                        </p>
                      )}
                      {c.notes && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{c.notes}</p>
                      )}
                    </div>
                  </div>
                  {renderRowActions('centers', c.id, () => {
                    setCenterId(c.id);
                    setCenterName(c.name);
                    setCenterLoc(c.location_text ?? '');
                    setCenterLat(c.latitude != null ? String(c.latitude) : '');
                    setCenterLng(c.longitude != null ? String(c.longitude) : '');
                    setCenterNotes(c.notes ?? '');
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 3. Buddies */}
      {tab === 'buddies' && (
        <div className="panel-surface p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">{t('buddiesTitle')}</h2>
            {buddyId && (
              <button
                type="button"
                onClick={resetBuddyForm}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                {t('editingLabel')} · {t('cancel')}
              </button>
            )}
          </div>
          {!isOffline && (
            <form
              onSubmit={(e) => void handleSaveBuddy(e)}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
            >
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('gearName')}</span>
                <input
                  type="text"
                  required
                  value={buddyName}
                  onChange={(e) => setBuddyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('notes')}</span>
                <input
                  type="text"
                  value={buddyNotes}
                  onChange={(e) => setBuddyNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
              </label>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-sm font-medium px-3 py-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {buddyId ? t('saveChanges') : t('addBuddy')}
              </button>
            </form>
          )}
          <ul className="space-y-2.5">
            {buddies.map((b) => (
              <li
                key={b.id}
                className="rounded-xl border border-sky-200/75 bg-sky-50/35 hover:bg-sky-50/75 transition-colors px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-lg bg-sky-100/90 text-sky-700 inline-flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{b.name}</p>
                    {b.notes && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{b.notes}</p>
                    )}
                  </div>
                </div>
                {renderRowActions('buddies', b.id, () => {
                  setBuddyId(b.id);
                  setBuddyName(b.name);
                  setBuddyNotes(b.notes ?? '');
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4. Dive Computers */}
      {tab === 'computers' && (
        <div className="panel-surface p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">{t('computersTitle')}</h2>
            {compId && (
              <button
                type="button"
                onClick={resetCompForm}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                {t('editingLabel')} · {t('cancel')}
              </button>
            )}
          </div>
          {!isOffline && (
            <form
              onSubmit={(e) => void handleSaveComputer(e)}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
            >
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('gearName')}</span>
                <input
                  type="text"
                  required
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('gearBrand')}</span>
                <input
                  type="text"
                  value={compBrand}
                  onChange={(e) => setCompBrand(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('gearModel')}</span>
                <input
                  type="text"
                  value={compModel}
                  onChange={(e) => setCompModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('notes')}</span>
                <input
                  type="text"
                  value={compNotes}
                  onChange={(e) => setCompNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
              </label>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-sm font-medium px-3 py-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {compId ? t('saveChanges') : t('addComputer')}
              </button>
            </form>
          )}
          <ul className="space-y-2.5">
            {computers.map((c) => {
              const subtitle = [c.brand, c.model].filter(Boolean).join(' · ');
              return (
                <li
                  key={c.id}
                  className="rounded-xl border border-sky-200/75 bg-sky-50/35 hover:bg-sky-50/75 transition-colors px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-lg bg-sky-100/90 text-sky-700 inline-flex items-center justify-center shrink-0">
                      <Cpu className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{c.name}</p>
                      {(subtitle || c.notes) && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {[subtitle, c.notes].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  {renderRowActions('computers', c.id, () => {
                    setCompId(c.id);
                    setCompName(c.name);
                    setCompBrand(c.brand ?? '');
                    setCompModel(c.model ?? '');
                    setCompNotes(c.notes ?? '');
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

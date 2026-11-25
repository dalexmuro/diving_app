import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { LocationPicker } from '../components/LocationPicker';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';
import {
  type Buddy,
  type Certification,
  type DiveCenter,
  type DiveComputer,
  type GearItem,
} from '../types/domain';

interface GearCertsPageProps {
  isOffline: boolean;
}

type CatalogTab = 'gear' | 'centers' | 'buddies' | 'computers' | 'certs';

export function GearCertsPage({ isOffline }: GearCertsPageProps) {
  const { t } = usePreferences();
  const [tab, setTab] = useState<CatalogTab>('gear');

  const [gear, setGear] = useState<GearItem[]>([]);
  const [centers, setCenters] = useState<DiveCenter[]>([]);
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [computers, setComputers] = useState<DiveComputer[]>([]);
  const [certs, setCerts] = useState<Certification[]>([]);

  // Gear form (#10: Name, Brand, Model, Notes)
  const [gearId, setGearId] = useState<string | undefined>(undefined);
  const [gearName, setGearName] = useState('');
  const [gearBrand, setGearBrand] = useState('');
  const [gearModel, setGearModel] = useState('');
  const [gearNotes, setGearNotes] = useState('');

  // Centers form (#5 & #11)
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

  // Certifications form
  const [certId, setCertId] = useState<string | undefined>(undefined);
  const [agency, setAgency] = useState('');
  const [level, setLevel] = useState('');
  const [certNumber, setCertNumber] = useState('');
  const [issuedDate, setIssuedDate] = useState('');

  async function reloadAll() {
    const [g, c, b, comp, cr] = await Promise.all([
      apiClient.fetchGear(),
      apiClient.fetchCenters(),
      apiClient.fetchBuddies(),
      apiClient.fetchComputers(),
      apiClient.fetchCertifications(),
    ]);
    setGear(g.data);
    setCenters(c.data);
    setBuddies(b.data);
    setComputers(comp.data);
    setCerts(cr.data);
  }

  useEffect(() => {
    void reloadAll();
  }, []);

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
    setGearId(undefined);
    setGearName('');
    setGearBrand('');
    setGearModel('');
    setGearNotes('');
    await reloadAll();
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
    setCenterId(undefined);
    setCenterName('');
    setCenterLoc('');
    setCenterLat('');
    setCenterLng('');
    setCenterNotes('');
    await reloadAll();
  }

  async function handleSaveBuddy(e: FormEvent) {
    e.preventDefault();
    if (isOffline || !buddyName.trim()) return;
    await apiClient.saveBuddy({
      id: buddyId,
      name: buddyName.trim(),
      notes: buddyNotes.trim() || null,
    });
    setBuddyId(undefined);
    setBuddyName('');
    setBuddyNotes('');
    await reloadAll();
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
    setCompId(undefined);
    setCompName('');
    setCompBrand('');
    setCompModel('');
    setCompNotes('');
    await reloadAll();
  }

  async function handleSaveCert(e: FormEvent) {
    e.preventDefault();
    if (isOffline || !agency.trim() || !level.trim()) return;
    await apiClient.saveCertification({
      id: certId,
      agency: agency.trim(),
      level: level.trim(),
      cert_number: certNumber.trim() || null,
      issued_date: issuedDate || null,
    });
    setCertId(undefined);
    setAgency('');
    setLevel('');
    setCertNumber('');
    setIssuedDate('');
    await reloadAll();
  }

  const tabs: Array<{ id: CatalogTab; label: string; count: number }> = [
    { id: 'gear', label: t('gearTitle'), count: gear.length },
    { id: 'centers', label: t('centersTitle'), count: centers.length },
    { id: 'buddies', label: t('buddiesTitle'), count: buddies.length },
    { id: 'computers', label: t('computersTitle'), count: computers.length },
    { id: 'certs', label: t('certsTitle'), count: certs.length },
  ];

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {t('navGearCerts')}
      </h1>

      {/* Catalog Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              tab === item.id
                ? 'bg-[#0b192c] text-white'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {item.label}{' '}
            <span className="opacity-75 tabular-telemetry">({item.count})</span>
          </button>
        ))}
      </div>

      {/* 1. Gear (Name, Brand, Model, Notes) */}
      {tab === 'gear' && (
        <div className="panel-surface p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{t('gearTitle')}</h2>
          {!isOffline && (
            <form onSubmit={(e) => void handleSaveGear(e)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <input
                type="text"
                required
                placeholder={t('gearName')}
                value={gearName}
                onChange={(e) => setGearName(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <input
                type="text"
                placeholder={t('gearBrand')}
                value={gearBrand}
                onChange={(e) => setGearBrand(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <input
                type="text"
                placeholder={t('gearModel')}
                value={gearModel}
                onChange={(e) => setGearModel(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <input
                type="text"
                placeholder={t('notes')}
                value={gearNotes}
                onChange={(e) => setGearNotes(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium px-3 py-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {t('addGear')}
              </button>
            </form>
          )}
          <ul className="divide-y divide-slate-200">
            {gear.map((item) => (
              <li key={item.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {[item.brand, item.model].filter(Boolean).join(' · ') || item.brand_model || '—'}
                    {item.notes ? ` — ${item.notes}` : ''}
                  </p>
                </div>
                {!isOffline && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={t('edit')}
                      onClick={() => {
                        setGearId(item.id);
                        setGearName(item.name);
                        setGearBrand(item.brand ?? '');
                        setGearModel(item.model ?? '');
                        setGearNotes(item.notes ?? '');
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-700 hover:bg-sky-50 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('delete')}
                      onClick={() => void apiClient.deleteGear(item.id).then(reloadAll)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 2. Dive Centers (with Location Search & GPS) */}
      {tab === 'centers' && (
        <div className="panel-surface p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{t('centersTitle')}</h2>
          {!isOffline && (
            <form onSubmit={(e) => void handleSaveCenter(e)} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder={t('diveCenter')}
                  value={centerName}
                  onChange={(e) => setCenterName(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
                <input
                  type="text"
                  placeholder={t('notes')}
                  value={centerNotes}
                  onChange={(e) => setCenterNotes(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium px-4 py-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {t('addCenter')}
              </button>
            </form>
          )}
          <ul className="divide-y divide-slate-200">
            {centers.map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500 tabular-telemetry">
                    {c.location_text || '—'}
                    {c.latitude != null && c.longitude != null
                      ? ` (${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)})`
                      : ''}
                  </p>
                </div>
                {!isOffline && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={t('edit')}
                      onClick={() => {
                        setCenterId(c.id);
                        setCenterName(c.name);
                        setCenterLoc(c.location_text ?? '');
                        setCenterLat(c.latitude != null ? String(c.latitude) : '');
                        setCenterLng(c.longitude != null ? String(c.longitude) : '');
                        setCenterNotes(c.notes ?? '');
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-700 hover:bg-sky-50 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('delete')}
                      onClick={() => void apiClient.deleteCenter(c.id).then(reloadAll)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. Buddies */}
      {tab === 'buddies' && (
        <div className="panel-surface p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{t('buddiesTitle')}</h2>
          {!isOffline && (
            <form onSubmit={(e) => void handleSaveBuddy(e)} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                required
                placeholder={t('gearName')}
                value={buddyName}
                onChange={(e) => setBuddyName(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <input
                type="text"
                placeholder={t('notes')}
                value={buddyNotes}
                onChange={(e) => setBuddyNotes(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium px-3 py-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {t('addBuddy')}
              </button>
            </form>
          )}
          <ul className="divide-y divide-slate-200">
            {buddies.map((b) => (
              <li key={b.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{b.name}</p>
                  {b.notes && <p className="text-xs text-slate-500">{b.notes}</p>}
                </div>
                {!isOffline && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={t('edit')}
                      onClick={() => {
                        setBuddyId(b.id);
                        setBuddyName(b.name);
                        setBuddyNotes(b.notes ?? '');
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-700 hover:bg-sky-50 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('delete')}
                      onClick={() => void apiClient.deleteBuddy(b.id).then(reloadAll)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4. Dive Computers */}
      {tab === 'computers' && (
        <div className="panel-surface p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{t('computersTitle')}</h2>
          {!isOffline && (
            <form onSubmit={(e) => void handleSaveComputer(e)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <input
                type="text"
                required
                placeholder={t('gearName')}
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <input
                type="text"
                placeholder={t('gearBrand')}
                value={compBrand}
                onChange={(e) => setCompBrand(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <input
                type="text"
                placeholder={t('gearModel')}
                value={compModel}
                onChange={(e) => setCompModel(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <input
                type="text"
                placeholder={t('notes')}
                value={compNotes}
                onChange={(e) => setCompNotes(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium px-3 py-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {t('addComputer')}
              </button>
            </form>
          )}
          <ul className="divide-y divide-slate-200">
            {computers.map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {[c.brand, c.model].filter(Boolean).join(' · ') || '—'}
                    {c.notes ? ` — ${c.notes}` : ''}
                  </p>
                </div>
                {!isOffline && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={t('edit')}
                      onClick={() => {
                        setCompId(c.id);
                        setCompName(c.name);
                        setCompBrand(c.brand ?? '');
                        setCompModel(c.model ?? '');
                        setCompNotes(c.notes ?? '');
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-700 hover:bg-sky-50 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('delete')}
                      onClick={() => void apiClient.deleteComputer(c.id).then(reloadAll)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. Certifications */}
      {tab === 'certs' && (
        <div className="panel-surface p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{t('certsTitle')}</h2>
          {!isOffline && (
            <form onSubmit={(e) => void handleSaveCert(e)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <input
                type="text"
                required
                placeholder={t('certAgency')}
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <input
                type="text"
                required
                placeholder={t('certLevel')}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <input
                type="text"
                placeholder={t('certNumber')}
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
              <input
                type="date"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium px-3 py-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {t('addCert')}
              </button>
            </form>
          )}
          <ul className="divide-y divide-slate-200">
            {certs.map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {c.agency} — {c.level}
                  </p>
                  <p className="text-xs text-slate-500 tabular-telemetry">
                    {c.cert_number || '—'}
                    {c.issued_date ? ` · ${c.issued_date}` : ''}
                  </p>
                </div>
                {!isOffline && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={t('edit')}
                      onClick={() => {
                        setCertId(c.id);
                        setAgency(c.agency);
                        setLevel(c.level);
                        setCertNumber(c.cert_number ?? '');
                        setIssuedDate(c.issued_date ?? '');
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-700 hover:bg-sky-50 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('delete')}
                      onClick={() => void apiClient.deleteCertification(c.id).then(reloadAll)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';
import { type Certification, type GearItem } from '../types/domain';

interface GearCertsPageProps {
  isOffline: boolean;
}

export function GearCertsPage({ isOffline }: GearCertsPageProps) {
  const { t } = usePreferences();
  const [gear, setGear] = useState<GearItem[]>([]);
  const [certs, setCerts] = useState<Certification[]>([]);

  // Gear form
  const [gearName, setGearName] = useState('');
  const [gearCat, setGearCat] = useState('');
  const [brandModel, setBrandModel] = useState('');

  // Cert form
  const [agency, setAgency] = useState('');
  const [level, setLevel] = useState('');
  const [certNumber, setCertNumber] = useState('');
  const [issuedDate, setIssuedDate] = useState('');

  async function reloadAll() {
    const [gRes, cRes] = await Promise.all([
      apiClient.fetchGear(),
      apiClient.fetchCertifications(),
    ]);
    setGear(gRes.data);
    setCerts(cRes.data);
  }

  useEffect(() => {
    void reloadAll();
  }, []);

  async function handleAddGear(e: FormEvent) {
    e.preventDefault();
    if (isOffline || !gearName.trim() || !gearCat.trim()) return;
    await apiClient.addGear({
      name: gearName.trim(),
      category: gearCat.trim(),
      brand_model: brandModel.trim() || undefined,
    });
    setGearName('');
    setGearCat('');
    setBrandModel('');
    await reloadAll();
  }

  async function handleAddCert(e: FormEvent) {
    e.preventDefault();
    if (isOffline || !agency.trim() || !level.trim()) return;
    await apiClient.addCertification({
      agency: agency.trim(),
      level: level.trim(),
      cert_number: certNumber.trim() || undefined,
      issued_date: issuedDate || undefined,
    });
    setAgency('');
    setLevel('');
    setCertNumber('');
    setIssuedDate('');
    await reloadAll();
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {t('navGearCerts')}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gear List */}
        <div className="panel-surface p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{t('gearTitle')}</h2>

          {!isOffline && (
            <form onSubmit={(e) => void handleAddGear(e)} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                required
                placeholder={t('gearCategory')}
                value={gearCat}
                onChange={(e) => setGearCat(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('brandModel')}
                  value={brandModel}
                  onChange={(e) => setBrandModel(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
                />
                <button
                  type="submit"
                  aria-label={t('addGear')}
                  className="inline-flex items-center justify-center rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-3 py-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          <ul className="divide-y divide-slate-200">
            {gear.map((item) => (
              <li key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {item.category}
                    {item.brand_model ? ` · ${item.brand_model}` : ''}
                  </p>
                </div>
                {!isOffline && (
                  <button
                    type="button"
                    aria-label={t('delete')}
                    onClick={() => void apiClient.deleteGear(item.id).then(reloadAll)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Certifications List */}
        <div className="panel-surface p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">{t('certsTitle')}</h2>

          {!isOffline && (
            <form onSubmit={(e) => void handleAddCert(e)} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              <div className="flex gap-2">
                <input
                  type="date"
                  value={issuedDate}
                  onChange={(e) => setIssuedDate(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
                />
                <button
                  type="submit"
                  aria-label={t('addCert')}
                  className="inline-flex items-center justify-center rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-3 py-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          <ul className="divide-y divide-slate-200">
            {certs.map((c) => (
              <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
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
                  <button
                    type="button"
                    aria-label={t('delete')}
                    onClick={() => void apiClient.deleteCertification(c.id).then(reloadAll)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

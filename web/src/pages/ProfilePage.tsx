import {
  Award,
  FileDown,
  IdCard,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';
import { type Certification, type DiverProfile } from '../types/domain';

interface ProfilePageProps {
  isOffline: boolean;
}

export function ProfilePage({ isOffline }: ProfilePageProps) {
  const { t } = usePreferences();

  const [profile, setProfile] = useState<DiverProfile | null>(null);
  const [certs, setCerts] = useState<Certification[]>([]);
  const [editingLicense, setEditingLicense] = useState(false);
  const [qrZoomOpen, setQrZoomOpen] = useState(false);
  const [savingLicense, setSavingLicense] = useState(false);
  const [confirmDeleteCertId, setConfirmDeleteCertId] = useState<string | null>(null);

  // License edit form state
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [federation, setFederation] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [clubName, setClubName] = useState('');
  const [clubNumber, setClubNumber] = useState('');
  const [licenseCategory, setLicenseCategory] = useState('');
  const [insurance, setInsurance] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [licensePdfFile, setLicensePdfFile] = useState<File | null>(null);

  // Certifications form state
  const [certId, setCertId] = useState<string | undefined>(undefined);
  const [agency, setAgency] = useState('');
  const [level, setLevel] = useState('');
  const [certLocation, setCertLocation] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [certPdfFile, setCertPdfFile] = useState<File | null>(null);

  function hydrateLicenseForm(p: DiverProfile) {
    setFullName(p.full_name ?? '');
    setBirthDate(p.birth_date ?? '');
    setFederation(p.federation ?? '');
    setLicenseNumber(p.license_number ?? '');
    setClubName(p.club_name ?? '');
    setClubNumber(p.club_number ?? '');
    setLicenseCategory(p.license_category ?? '');
    setInsurance(p.insurance ?? '');
    setValidFrom(p.valid_from ?? '');
    setValidUntil(p.valid_until ?? '');
    setLicensePdfFile(null);
  }

  async function reloadCerts() {
    setCerts((await apiClient.fetchCertifications()).data);
  }

  useEffect(() => {
    void Promise.all([apiClient.fetchProfile(), apiClient.fetchCertifications()]).then(
      ([profRes, certRes]) => {
        if (profRes.data) {
          setProfile(profRes.data);
          hydrateLicenseForm(profRes.data);
        }
        setCerts(certRes.data);
      },
    );
  }, []);

  useEffect(() => {
    if (!qrZoomOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQrZoomOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [qrZoomOpen]);

  async function handleSaveLicense(e: FormEvent) {
    e.preventDefault();
    if (isOffline) return;
    setSavingLicense(true);
    try {
      let updated = await apiClient.updateProfile({
        full_name: fullName.trim() || null,
        birth_date: birthDate.trim() || null,
        federation: federation.trim() || null,
        license_number: licenseNumber.trim() || null,
        club_name: clubName.trim() || null,
        club_number: clubNumber.trim() || null,
        license_category: licenseCategory.trim() || null,
        insurance: insurance.trim() || null,
        valid_from: validFrom.trim() || null,
        valid_until: validUntil.trim() || null,
      });
      if (licensePdfFile) {
        updated = await apiClient.uploadLicensePdf(licensePdfFile);
      }
      setProfile(updated);
      hydrateLicenseForm(updated);
      setEditingLicense(false);
    } finally {
      setSavingLicense(false);
    }
  }

  function resetCertForm() {
    setCertId(undefined);
    setAgency('');
    setLevel('');
    setCertLocation('');
    setIssuedDate('');
    setCertPdfFile(null);
  }

  async function handleSaveCert(e: FormEvent) {
    e.preventDefault();
    if (isOffline || !agency.trim() || !level.trim()) return;
    const saved = await apiClient.saveCertification({
      id: certId,
      agency: agency.trim(),
      level: level.trim(),
      location: certLocation.trim() || null,
      issued_date: issuedDate || null,
    });
    if (certPdfFile) {
      await apiClient.uploadCertificationPdf(saved.id, certPdfFile);
    }
    resetCertForm();
    await reloadCerts();
  }

  async function handleDeleteCert(id: string) {
    setConfirmDeleteCertId(null);
    await apiClient.deleteCertification(id);
    await reloadCerts();
  }

  return (
    <section className="space-y-6">
      <h1 className="text-[clamp(1.35rem,2.5vw,1.6rem)] font-bold tracking-tight text-slate-900">
        {t('profileTitle')}
      </h1>

      {/* SECTION 1: Federation License + Official QR Code */}
      <div className="rounded-xl border border-sky-200/90 bg-sky-50/50 p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-200/70 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-sky-100 text-sky-700 inline-flex items-center justify-center">
              <IdCard className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold tracking-tight text-slate-900">
              {t('licenseTitle')}
            </h2>
            {profile?.federation && (
              <span className="rounded-full bg-sky-600 text-white px-2.5 py-0.5 text-[11px] font-bold tracking-wide">
                {profile.federation}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {profile?.license_pdf_r2_key && !isOffline && (
              <a
                href={apiClient.getLicensePdfUrl()}
                download={profile.license_pdf_filename || 'Attestation Licence.pdf'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium px-3 py-1.5 transition-colors"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>{t('downloadLicense')}</span>
              </a>
            )}
            {!isOffline && (
              <button
                type="button"
                onClick={() => {
                  if (editingLicense && profile) hydrateLicenseForm(profile);
                  setEditingLicense((prev) => !prev);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white hover:bg-sky-50 text-slate-700 text-xs font-medium px-3 py-1.5 transition-colors cursor-pointer"
              >
                {editingLicense ? (
                  <>
                    <X className="w-3.5 h-3.5" />
                    <span>{t('cancel')}</span>
                  </>
                ) : (
                  <>
                    <Pencil className="w-3.5 h-3.5 text-sky-600" />
                    <span>{t('edit')}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {!editingLicense ? (
          <div className="flex flex-col md:flex-row items-start justify-between gap-6">
            <div className="flex-1 min-w-0 w-full space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <p className="text-lg font-bold text-slate-900">
                    {profile?.full_name || '—'}
                  </p>
                  {profile?.license_number && (
                    <p className="text-sm font-semibold text-sky-800 tabular-telemetry mt-0.5">
                      {t('licenseNumber')}: {profile.license_number}
                    </p>
                  )}
                </div>
                {profile?.valid_until && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-800 tabular-telemetry md:ml-auto">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    {t('licenseValidUntil')} {profile.valid_until}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-sky-200/60">
                <div className="rounded-xl bg-white/85 border border-sky-100 px-3.5 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {t('licenseClub')}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">
                    {profile?.club_name || '—'}
                  </p>
                  {profile?.club_number && (
                    <p className="text-xs text-slate-500 tabular-telemetry">
                      N° {profile.club_number}
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-white/85 border border-sky-100 px-3.5 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {t('licenseValidity')}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 tabular-telemetry mt-0.5">
                    {profile?.valid_from && profile?.valid_until
                      ? `${profile.valid_from} → ${profile.valid_until}`
                      : profile?.valid_until || '—'}
                  </p>
                  {profile?.birth_date && (
                    <p className="text-xs text-slate-500 tabular-telemetry">
                      {t('birthDate')}: {profile.birth_date}
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-white/85 border border-sky-100 px-3.5 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {t('licenseCategory')}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">
                    {profile?.license_category || '—'}
                  </p>
                </div>

                <div className="rounded-xl bg-white/85 border border-sky-100 px-3.5 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {t('licenseInsurance')}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">
                    {profile?.insurance || '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Official License QR Code */}
            {profile?.license_qr_r2_key && !isOffline && (
              <div className="shrink-0 flex flex-col items-center gap-2 self-center md:self-start">
                <button
                  type="button"
                  onClick={() => setQrZoomOpen(true)}
                  className="group relative rounded-2xl border-2 border-sky-200 bg-white p-3 shadow-sm hover:border-sky-400 hover:shadow-md transition-all cursor-pointer"
                  aria-label={t('licenseQrHint')}
                >
                  <img
                    src={apiClient.getLicenseQrUrl()}
                    alt={t('licenseTitle')}
                    className="w-36 h-36 sm:w-40 sm:h-40 object-contain"
                  />
                </button>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <QrCode className="w-3 h-3 text-sky-600" />
                  {t('licenseQrHint')}
                </span>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={(e) => void handleSaveLicense(e)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('fullName')}</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('federation')}</span>
                <input
                  type="text"
                  value={federation}
                  onChange={(e) => setFederation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('licenseNumber')}</span>
                <input
                  type="text"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('licenseClub')}</span>
                <input
                  type="text"
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('clubNumber')}</span>
                <input
                  type="text"
                  value={clubNumber}
                  onChange={(e) => setClubNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('birthDate')}</span>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm tabular-telemetry text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('licenseCategory')}</span>
                <input
                  type="text"
                  value={licenseCategory}
                  onChange={(e) => setLicenseCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">
                <span>{t('licenseInsurance')}</span>
                <input
                  type="text"
                  value={insurance}
                  onChange={(e) => setInsurance(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs font-medium text-slate-700">
                  <span>{t('validFrom')}</span>
                  <input
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs tabular-telemetry text-slate-900"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-slate-700">
                  <span>{t('validUntil')}</span>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs tabular-telemetry text-slate-900"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 pt-2 border-t border-sky-200/60">
              <label className="space-y-1 text-xs font-medium text-slate-700 max-w-xs w-full">
                <span>{t('licensePdf')}</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setLicensePdfFile(e.target.files?.[0] ?? null)}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-sky-50 file:px-2 file:py-1 file:text-xs file:font-medium file:text-sky-700"
                />
              </label>
              <button
                type="submit"
                disabled={savingLicense}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{t('saveChanges')}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* SECTION 2: Certifications */}
      <div className="panel-surface p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-sky-100 text-sky-700 inline-flex items-center justify-center">
              <Award className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold tracking-tight text-slate-900">
              {t('certsTitle')}{' '}
              <span className="text-sm font-medium text-slate-500 tabular-telemetry">
                ({certs.length})
              </span>
            </h2>
          </div>
          {certId && (
            <button
              type="button"
              onClick={resetCertForm}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              {t('editingLabel')} · {t('cancel')}
            </button>
          )}
        </div>

        {!isOffline && (
          <form
            onSubmit={(e) => void handleSaveCert(e)}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
          >
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('certAgency')}</span>
              <input
                type="text"
                required
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('certLevel')}</span>
              <input
                type="text"
                required
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('certLocation')}</span>
              <input
                type="text"
                value={certLocation}
                onChange={(e) => setCertLocation(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('issuedDate')}</span>
              <input
                type="date"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              <span>{t('certPdf')}</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setCertPdfFile(e.target.files?.[0] ?? null)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-sky-50 file:px-2 file:py-1 file:text-xs file:font-medium file:text-sky-700"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-sm font-medium px-3 py-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {certId ? t('saveChanges') : t('addCert')}
            </button>
          </form>
        )}

        <ul className="space-y-2.5">
          {certs.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-sky-200/75 bg-sky-50/35 hover:bg-sky-50/75 transition-colors px-4 py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-lg bg-sky-100/90 text-sky-700 inline-flex items-center justify-center shrink-0">
                  <Award className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{c.level}</p>
                  <p className="text-xs text-slate-600 truncate mt-0.5">{c.agency}</p>
                  {(c.location || c.issued_date) && (
                    <p className="text-xs text-slate-500 tabular-telemetry inline-flex flex-wrap items-center gap-1.5 mt-0.5">
                      {c.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-sky-600 shrink-0" />
                          {c.location}
                        </span>
                      )}
                      {c.location && c.issued_date && <span>·</span>}
                      {c.issued_date && <span>{c.issued_date}</span>}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.pdf_r2_key && !isOffline && (
                  <a
                    href={apiClient.getCertificationPdfUrl(c.id)}
                    download={c.pdf_filename || `${c.level}.pdf`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white hover:bg-sky-100 text-sky-800 text-xs font-medium px-3 py-1.5 transition-colors"
                  >
                    <FileDown className="w-3.5 h-3.5 text-sky-600" />
                    <span>{t('downloadPdf')}</span>
                  </a>
                )}
                {!isOffline &&
                  (confirmDeleteCertId === c.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCertId(null)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        {t('cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCert(c.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-medium text-white cursor-pointer"
                      >
                        {t('delete')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        aria-label={t('edit')}
                        onClick={() => {
                          setCertId(c.id);
                          setAgency(c.agency);
                          setLevel(c.level);
                          setCertLocation(c.location ?? '');
                          setIssuedDate(c.issued_date ?? '');
                          setCertPdfFile(null);
                        }}
                        className="touch-target flex items-center justify-center rounded-lg text-slate-500 hover:text-sky-700 hover:bg-sky-50 active:bg-sky-100 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={t('delete')}
                        onClick={() => setConfirmDeleteCertId(c.id)}
                        className="touch-target flex items-center justify-center rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 active:bg-red-100 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* QR Code Zoom Modal for effortless scanning at dive centers */}
      {qrZoomOpen && profile?.license_qr_r2_key && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setQrZoomOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 max-w-sm w-full flex flex-col items-center gap-4 shadow-2xl cursor-default"
          >
            <div className="w-full flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">{profile.full_name}</p>
                <p className="text-xs font-medium text-sky-700 tabular-telemetry">
                  {profile.license_number}
                </p>
              </div>
              <button
                type="button"
                aria-label={t('cancel')}
                onClick={() => setQrZoomOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={apiClient.getLicenseQrUrl()}
              alt={t('licenseTitle')}
              className="w-64 h-64 sm:w-72 sm:h-72 object-contain"
            />
            {profile.club_name && (
              <p className="text-xs text-slate-500 text-center">
                {profile.club_name}
                {profile.club_number ? ` · N° ${profile.club_number}` : ''}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

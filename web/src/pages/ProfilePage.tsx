import {
  AlertCircle,
  AlertTriangle,
  Award,
  Check,
  FileDown,
  IdCard,
  MapPin,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';
import { type Certification, type DiverProfile } from '../types/domain';

interface ProfilePageProps {
  isOffline: boolean;
}

export function ProfilePage({ isOffline }: ProfilePageProps) {
  const { language, t } = usePreferences();

  const [profile, setProfile] = useState<DiverProfile | null>(null);
  const [certs, setCerts] = useState<Certification[]>([]);
  const [qrZoomOpen, setQrZoomOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(
    null,
  );
  const [uploadingCertId, setUploadingCertId] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([apiClient.fetchProfile(), apiClient.fetchCertifications()]).then(
      ([profRes, certRes]) => {
        if (profRes.data) {
          setProfile(profRes.data);
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

  async function handleSyncFfessm() {
    if (isOffline || syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await apiClient.syncProfileFromFfessm();
      setProfile(res.profile);
      setCerts(res.certifications);
      const hasIncomplete = res.certifications.some((c) => !c.agency || !c.pdf_r2_key);
      if (res.newCertificationsCount > 0 || hasIncomplete) {
        setSyncMessage({ kind: 'warn', text: t('ffessmNewCertsNotice') });
      } else {
        setSyncMessage({ kind: 'ok', text: t('ffessmSyncedOk') });
      }
    } catch {
      setSyncMessage({ kind: 'err', text: t('ffessmSyncError') });
    } finally {
      setSyncing(false);
    }
  }

  async function handleUploadCertPdf(certId: string, file: File | null) {
    if (!file || isOffline) return;
    setUploadingCertId(certId);
    setSyncMessage(null);
    try {
      await apiClient.uploadCertificationPdf(certId, file);
      const refreshed = await apiClient.fetchCertifications();
      setCerts(refreshed.data);
    } finally {
      setUploadingCertId(null);
    }
  }

  const formatSyncDate = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  };

  const medicalInvalid =
    profile?.medical_cert_status != null &&
    /manquant|invalide|❌/i.test(profile.medical_cert_status);

  return (
    <section className="space-y-6">
      <h1 className="text-[clamp(1.35rem,2.5vw,1.6rem)] font-bold tracking-tight text-slate-900">
        {t('profileTitle')}
      </h1>

      {syncMessage && (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
            syncMessage.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : syncMessage.kind === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {syncMessage.kind === 'ok' ? (
            <Check className="w-4 h-4 shrink-0" />
          ) : syncMessage.kind === 'warn' ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{syncMessage.text}</span>
        </div>
      )}

      {/* SECTION 1: Official FFESSM License + Scannable QR Code (100% read-only & synced) */}
      <div className="rounded-xl border border-sky-200/90 bg-sky-50/50 p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-200/70 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-sky-100 text-sky-700 inline-flex items-center justify-center">
              <IdCard className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-slate-900">
                  {t('licenseTitle')}
                </h2>
                {profile?.federation && (
                  <span className="rounded-full bg-sky-600 text-white px-2.5 py-0.5 text-[11px] font-bold tracking-wide">
                    {profile.federation}
                  </span>
                )}
              </div>
              {formatSyncDate(profile?.last_synced_at) && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {t('lastSyncedLabel')}: {formatSyncDate(profile?.last_synced_at)}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isOffline && (
              <button
                type="button"
                disabled={syncing || !profile?.ffessm_info_url}
                onClick={() => void handleSyncFfessm()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white hover:bg-sky-50 disabled:opacity-50 text-sky-900 text-xs font-medium px-3 py-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? t('syncingFfessm') : t('syncFfessm')}</span>
              </button>
            )}
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
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-start justify-between gap-6">
          <div className="flex-1 min-w-0 w-full space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="text-lg font-bold text-slate-900">{profile?.full_name || '—'}</p>
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
                  <p className="text-xs text-slate-500 tabular-telemetry">N° {profile.club_number}</p>
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
                {profile?.insurance_valid_until && (
                  <p className="text-xs text-slate-500 tabular-telemetry">
                    {t('licenseValidUntil')} {profile.insurance_valid_until}
                  </p>
                )}
              </div>
            </div>

            {profile?.medical_cert_status && (
              <div
                className={`rounded-xl border px-3.5 py-2.5 flex items-start gap-2.5 ${
                  medicalInvalid
                    ? 'border-amber-200 bg-amber-50/80 text-amber-900'
                    : 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                }`}
              >
                <Stethoscope
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    medicalInvalid ? 'text-amber-600' : 'text-emerald-600'
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                    {t('medicalCertTitle')}
                  </p>
                  <p className="text-xs font-medium mt-0.5">{profile.medical_cert_status}</p>
                </div>
              </div>
            )}
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
      </div>

      {/* SECTION 2: Official FFESSM Certifications (read-only, synced from federation + PDF completion) */}
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
        </div>

        <ul className="space-y-2.5">
          {certs.map((c) => {
            const isIncomplete = !c.agency || !c.pdf_r2_key;
            const isUploading = uploadingCertId === c.id;
            return (
              <li
                key={c.id}
                className={`rounded-xl border px-4 py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 transition-colors ${
                  isIncomplete
                    ? 'border-amber-200 bg-amber-50/50'
                    : 'border-sky-200/75 bg-sky-50/35 hover:bg-sky-50/75'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-9 h-9 rounded-lg inline-flex items-center justify-center shrink-0 ${
                      isIncomplete
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-sky-100/90 text-sky-700'
                    }`}
                  >
                    {isIncomplete ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <Award className="w-4 h-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{c.level}</p>
                    {c.agency && (
                      <p className="text-xs text-slate-600 truncate mt-0.5">{c.agency}</p>
                    )}
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
                    {isIncomplete && (
                      <p className="text-xs font-medium text-amber-800 mt-1">
                        {t('certIncompleteNotice')}
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
                  {isIncomplete && !isOffline && (
                    <label className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-1.5 transition-colors cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isUploading ? t('uploadingPdf') : t('uploadCertPdf')}</span>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={isUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          e.target.value = '';
                          void handleUploadCertPdf(c.id, file);
                        }}
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>
              </li>
            );
          })}
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

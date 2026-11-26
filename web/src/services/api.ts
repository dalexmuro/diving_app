import { offlineCache } from '../offline/cacheDb';
import {
  type Buddy,
  type Certification,
  type DiveCenter,
  type DiveComputer,
  type DiveDetail,
  type DiveSite,
  type DiveSummary,
  type DiverProfile,
  type DraftFitInit,
  type GearItem,
  type GlobalStats,
  type UserSettings,
} from '../types/domain';

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body && !(init.body instanceof FormData) && !(init.body instanceof ArrayBuffer)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface GeocodingResult {
  displayName: string;
  latitude: number;
  longitude: number;
}

export const apiClient = {
  async searchLocation(query: string, signal?: AbortSignal): Promise<GeocodingResult[]> {
    if (!query.trim()) return [];
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query.trim())}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    return rows.map((r) => ({
      displayName: r.display_name,
      latitude: Number(Number(r.lat).toFixed(5)),
      longitude: Number(Number(r.lon).toFixed(5)),
    }));
  },

  async checkSession(): Promise<{ authenticated: boolean; email?: string; hasPasskey?: boolean }> {
    try {
      return await apiJson('/api/auth/me');
    } catch {
      return { authenticated: false };
    }
  },

  async logout(): Promise<void> {
    await apiJson('/api/auth/logout', { method: 'POST' });
  },

  async registerPasskey(): Promise<void> {
    const opts = await apiJson<{
      challenge: string;
      rp: PublicKeyCredentialRpEntity;
      user: { id: string; name: string; displayName: string };
      pubKeyCredParams: PublicKeyCredentialParameters[];
      authenticatorSelection: AuthenticatorSelectionCriteria;
      timeout: number;
      excludeCredentials: Array<{ id: string; type: 'public-key' }>;
    }>('/api/auth/webauthn/register/options', { method: 'POST' });

    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: base64UrlDecode(opts.challenge) as BufferSource,
        rp: opts.rp,
        user: {
          id: base64UrlDecode(opts.user.id) as BufferSource,
          name: opts.user.name,
          displayName: opts.user.displayName,
        },
        pubKeyCredParams: opts.pubKeyCredParams,
        authenticatorSelection: opts.authenticatorSelection,
        timeout: opts.timeout,
        excludeCredentials: opts.excludeCredentials.map((c) => ({
          id: base64UrlDecode(c.id) as BufferSource,
          type: 'public-key' as const,
        })),
      },
    })) as PublicKeyCredential | null;

    if (!cred) throw new Error('Passkey creation cancelled');
    const att = cred.response as AuthenticatorAttestationResponse;
    const spki = att.getPublicKey();
    if (!spki) throw new Error('Browser did not expose SPKI public key');

    await apiJson('/api/auth/webauthn/register/verify', {
      method: 'POST',
      body: JSON.stringify({
        id: base64UrlEncode(cred.rawId),
        publicKeySpki: base64UrlEncode(spki),
        clientDataJSON: base64UrlEncode(att.clientDataJSON),
        transports: att.getTransports?.() ?? ['internal'],
      }),
    });
  },

  async unlockWithPasskey(): Promise<boolean> {
    const opts = await apiJson<{
      challenge: string;
      rpId: string;
      userVerification: UserVerificationRequirement;
      timeout: number;
      allowCredentials: Array<{ id: string; type: 'public-key'; transports?: AuthenticatorTransport[] }>;
    }>('/api/auth/webauthn/login/options', { method: 'POST' });

    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: base64UrlDecode(opts.challenge) as BufferSource,
        rpId: opts.rpId,
        userVerification: opts.userVerification,
        timeout: opts.timeout,
        allowCredentials: opts.allowCredentials.map((c) => ({
          id: base64UrlDecode(c.id) as BufferSource,
          type: 'public-key' as const,
          transports: c.transports,
        })),
      },
    })) as PublicKeyCredential | null;

    if (!assertion) return false;
    const res = assertion.response as AuthenticatorAssertionResponse;
    await apiJson('/api/auth/webauthn/login/verify', {
      method: 'POST',
      body: JSON.stringify({
        id: base64UrlEncode(assertion.rawId),
        clientDataJSON: base64UrlEncode(res.clientDataJSON),
        authenticatorData: base64UrlEncode(res.authenticatorData),
        signature: base64UrlEncode(res.signature),
      }),
    });
    return true;
  },

  // --- Dives ---
  async fetchDives(): Promise<{ data: DiveSummary[]; offline: boolean }> {
    try {
      const { dives } = await apiJson<{ dives: DiveSummary[] }>('/api/dives');
      await offlineCache.setDives(dives);
      return { data: dives, offline: false };
    } catch {
      const cached = await offlineCache.getDives();
      return { data: cached ?? [], offline: true };
    }
  },

  async fetchDiveDetail(id: string): Promise<{ data: DiveDetail | null; offline: boolean }> {
    try {
      const { dive } = await apiJson<{ dive: DiveDetail }>(`/api/dives/${encodeURIComponent(id)}`);
      await offlineCache.setDiveDetail(dive);
      return { data: dive, offline: false };
    } catch {
      const cached = await offlineCache.getDiveDetail(id);
      return { data: cached, offline: true };
    }
  },

  async parseFitDraft(file: File): Promise<DraftFitInit> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiJson<{ ok: boolean; parsed: DraftFitInit['parsed']; fitBase64: string }>(
      '/api/dives/parse-fit',
      { method: 'POST', body: form },
    );
    return { parsed: res.parsed, fitBase64: res.fitBase64 };
  },

  async createDive(payload: Record<string, unknown>): Promise<DiveDetail> {
    const { dive } = await apiJson<{ dive: DiveDetail }>('/api/dives', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await offlineCache.setDiveDetail(dive);
    return dive;
  },

  async updateDive(id: string, patch: Record<string, unknown>): Promise<DiveDetail> {
    const { dive } = await apiJson<{ dive: DiveDetail }>(`/api/dives/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await offlineCache.setDiveDetail(dive);
    return dive;
  },

  async deleteDive(id: string): Promise<void> {
    await apiJson(`/api/dives/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await offlineCache.deleteDiveDetail(id);
  },

  // --- Stats ---
  async fetchStats(): Promise<{ data: GlobalStats | null; offline: boolean }> {
    try {
      const { stats } = await apiJson<{ stats: GlobalStats }>('/api/stats');
      await offlineCache.setStats(stats);
      return { data: stats, offline: false };
    } catch {
      return { data: await offlineCache.getStats(), offline: true };
    }
  },

  // --- Sites ---
  async fetchSites(): Promise<{ data: DiveSite[]; offline: boolean }> {
    try {
      const { sites } = await apiJson<{ sites: DiveSite[] }>('/api/sites');
      await offlineCache.setSites(sites);
      return { data: sites, offline: false };
    } catch {
      return { data: (await offlineCache.getSites()) ?? [], offline: true };
    }
  },

  async saveSite(site: Partial<DiveSite> & { name: string }): Promise<DiveSite> {
    const method = site.id ? 'PATCH' : 'POST';
    const url = site.id ? `/api/sites/${encodeURIComponent(site.id)}` : '/api/sites';
    const { site: saved } = await apiJson<{ site: DiveSite }>(url, {
      method,
      body: JSON.stringify(site),
    });
    return saved;
  },

  async deleteSite(id: string): Promise<void> {
    await apiJson(`/api/sites/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // --- Dive Centers ---
  async fetchCenters(): Promise<{ data: DiveCenter[]; offline: boolean }> {
    try {
      const { centers } = await apiJson<{ centers: DiveCenter[] }>('/api/centers');
      await offlineCache.setCenters(centers);
      return { data: centers, offline: false };
    } catch {
      return { data: (await offlineCache.getCenters()) ?? [], offline: true };
    }
  },

  async saveCenter(center: {
    id?: string;
    name: string;
    location_text?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    notes?: string | null;
  }): Promise<DiveCenter> {
    const method = center.id ? 'PATCH' : 'POST';
    const url = center.id ? `/api/centers/${encodeURIComponent(center.id)}` : '/api/centers';
    const { center: saved } = await apiJson<{ center: DiveCenter }>(url, {
      method,
      body: JSON.stringify(center),
    });
    return saved;
  },

  async deleteCenter(id: string): Promise<void> {
    await apiJson(`/api/centers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // --- Buddies ---
  async fetchBuddies(): Promise<{ data: Buddy[]; offline: boolean }> {
    try {
      const { buddies } = await apiJson<{ buddies: Buddy[] }>('/api/buddies');
      await offlineCache.setBuddies(buddies);
      return { data: buddies, offline: false };
    } catch {
      return { data: (await offlineCache.getBuddies()) ?? [], offline: true };
    }
  },

  async saveBuddy(buddy: { id?: string; name: string; notes?: string | null }): Promise<Buddy> {
    const method = buddy.id ? 'PATCH' : 'POST';
    const url = buddy.id ? `/api/buddies/${encodeURIComponent(buddy.id)}` : '/api/buddies';
    const { buddy: saved } = await apiJson<{ buddy: Buddy }>(url, {
      method,
      body: JSON.stringify(buddy),
    });
    return saved;
  },

  async deleteBuddy(id: string): Promise<void> {
    await apiJson(`/api/buddies/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // --- Dive Computers ---
  async fetchComputers(): Promise<{ data: DiveComputer[]; offline: boolean }> {
    try {
      const { computers } = await apiJson<{ computers: DiveComputer[] }>('/api/computers');
      await offlineCache.setComputers(computers);
      return { data: computers, offline: false };
    } catch {
      return { data: (await offlineCache.getComputers()) ?? [], offline: true };
    }
  },

  async saveComputer(computer: {
    id?: string;
    name: string;
    brand?: string | null;
    model?: string | null;
    notes?: string | null;
  }): Promise<DiveComputer> {
    const method = computer.id ? 'PATCH' : 'POST';
    const url = computer.id ? `/api/computers/${encodeURIComponent(computer.id)}` : '/api/computers';
    const { computer: saved } = await apiJson<{ computer: DiveComputer }>(url, {
      method,
      body: JSON.stringify(computer),
    });
    return saved;
  },

  async deleteComputer(id: string): Promise<void> {
    await apiJson(`/api/computers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // --- Gear (Name, Brand, Model, Notes) ---
  async fetchGear(): Promise<{ data: GearItem[]; offline: boolean }> {
    try {
      const { gear } = await apiJson<{ gear: GearItem[] }>('/api/gear');
      await offlineCache.setGear(gear);
      return { data: gear, offline: false };
    } catch {
      return { data: (await offlineCache.getGear()) ?? [], offline: true };
    }
  },

  async saveGear(item: {
    id?: string;
    name: string;
    brand?: string | null;
    model?: string | null;
    notes?: string | null;
  }): Promise<GearItem> {
    const method = item.id ? 'PATCH' : 'POST';
    const url = item.id ? `/api/gear/${encodeURIComponent(item.id)}` : '/api/gear';
    const { item: saved } = await apiJson<{ item: GearItem }>(url, {
      method,
      body: JSON.stringify(item),
    });
    return saved;
  },

  async deleteGear(id: string): Promise<void> {
    await apiJson(`/api/gear/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // --- Certifications ---
  async fetchCertifications(): Promise<{ data: Certification[]; offline: boolean }> {
    try {
      const { certifications } = await apiJson<{ certifications: Certification[] }>(
        '/api/certifications',
      );
      await offlineCache.setCertifications(certifications);
      return { data: certifications, offline: false };
    } catch {
      return { data: (await offlineCache.getCertifications()) ?? [], offline: true };
    }
  },

  async saveCertification(cert: {
    id?: string;
    agency: string;
    level: string;
    location?: string | null;
    cert_number?: string | null;
    issued_date?: string | null;
  }): Promise<Certification> {
    const method = cert.id ? 'PATCH' : 'POST';
    const url = cert.id
      ? `/api/certifications/${encodeURIComponent(cert.id)}`
      : '/api/certifications';
    const { certification } = await apiJson<{ certification: Certification }>(url, {
      method,
      body: JSON.stringify(cert),
    });
    return certification;
  },

  async uploadCertificationPdf(id: string, file: File): Promise<Certification> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/certifications/${encodeURIComponent(id)}/pdf`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (!res.ok) {
      throw new Error(`PDF upload failed (${res.status})`);
    }
    const data = (await res.json()) as { certification: Certification };
    return data.certification;
  },

  getCertificationPdfUrl(id: string): string {
    return `/api/certifications/${encodeURIComponent(id)}/pdf`;
  },

  async deleteCertification(id: string): Promise<void> {
    await apiJson(`/api/certifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // --- Diver Profile & License ---
  async fetchProfile(): Promise<{ data: DiverProfile | null; offline: boolean }> {
    try {
      const { profile } = await apiJson<{ profile: DiverProfile }>('/api/profile');
      return { data: profile, offline: false };
    } catch {
      return { data: null, offline: true };
    }
  },

  async updateProfile(patch: Partial<DiverProfile>): Promise<DiverProfile> {
    const { profile } = await apiJson<{ profile: DiverProfile }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return profile;
  },

  async uploadLicensePdf(file: File): Promise<DiverProfile> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/profile/license-pdf', {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (!res.ok) {
      throw new Error(`License PDF upload failed (${res.status})`);
    }
    const data = (await res.json()) as { profile: DiverProfile };
    return data.profile;
  },

  getLicensePdfUrl(): string {
    return '/api/profile/license-pdf';
  },

  getLicenseQrUrl(): string {
    return '/api/profile/license-qr';
  },

  // --- Settings & Suunto ---
  async fetchSettings(): Promise<UserSettings> {
    try {
      const { settings } = await apiJson<{ settings: UserSettings }>('/api/settings');
      await offlineCache.setSettings(settings);
      return settings;
    } catch {
      return (
        (await offlineCache.getSettings()) ?? {
          language: 'es',
          unit_system: 'metric',
          ascent_rate_limit_m_min: 15,
        }
      );
    }
  },

  async updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
    try {
      const { settings } = await apiJson<{ settings: UserSettings }>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await offlineCache.setSettings(settings);
      return settings;
    } catch {
      const fallback = (await offlineCache.getSettings()) ?? {
        language: 'es',
        unit_system: 'metric',
        ascent_rate_limit_m_min: 15,
      };
      const merged = { ...fallback, ...patch };
      await offlineCache.setSettings(merged);
      return merged;
    }
  },

  async getSuuntoStatus(): Promise<{ connected: boolean; expiresAt: string | null }> {
    try {
      return await apiJson('/api/suunto/status');
    } catch {
      return { connected: false, expiresAt: null };
    }
  },

  async syncSuunto(): Promise<{ imported: number; skipped: number }> {
    return apiJson('/api/sync/suunto', { method: 'POST' });
  },
};

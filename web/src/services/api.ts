import { offlineCache } from '../offline/cacheDb';
import {
  type Certification,
  type DiveDetail,
  type DiveSite,
  type DiveSummary,
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

export const apiClient = {
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

  async updateDive(id: string, patch: Record<string, unknown>): Promise<DiveDetail> {
    const { dive } = await apiJson<{ dive: DiveDetail }>(`/api/dives/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await offlineCache.setDiveDetail(dive);
    return dive;
  },

  async createDive(payload: Record<string, unknown>): Promise<DiveDetail> {
    const { dive } = await apiJson<{ dive: DiveDetail }>('/api/dives', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await offlineCache.setDiveDetail(dive);
    return dive;
  },

  async uploadFitFile(file: File): Promise<{ created: boolean; dive: DiveDetail }> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiJson<{ created: boolean; dive: DiveDetail }>('/api/dives/import-fit', {
      method: 'POST',
      body: form,
    });
    await offlineCache.setDiveDetail(res.dive);
    return res;
  },

  async fetchStats(): Promise<{ data: GlobalStats | null; offline: boolean }> {
    try {
      const { stats } = await apiJson<{ stats: GlobalStats }>('/api/stats');
      await offlineCache.setStats(stats);
      return { data: stats, offline: false };
    } catch {
      return { data: await offlineCache.getStats(), offline: true };
    }
  },

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

  async fetchGear(): Promise<{ data: GearItem[]; offline: boolean }> {
    try {
      const { gear } = await apiJson<{ gear: GearItem[] }>('/api/gear');
      await offlineCache.setGear(gear);
      return { data: gear, offline: false };
    } catch {
      return { data: (await offlineCache.getGear()) ?? [], offline: true };
    }
  },

  async addGear(item: {
    name: string;
    category: string;
    brand_model?: string;
    notes?: string;
  }): Promise<GearItem> {
    const { item: saved } = await apiJson<{ item: GearItem }>('/api/gear', {
      method: 'POST',
      body: JSON.stringify(item),
    });
    return saved;
  },

  async deleteGear(id: string): Promise<void> {
    await apiJson(`/api/gear/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

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

  async addCertification(cert: {
    agency: string;
    level: string;
    cert_number?: string;
    issued_date?: string;
  }): Promise<Certification> {
    const { certification } = await apiJson<{ certification: Certification }>(
      '/api/certifications',
      {
        method: 'POST',
        body: JSON.stringify(cert),
      },
    );
    return certification;
  },

  async deleteCertification(id: string): Promise<void> {
    await apiJson(`/api/certifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

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

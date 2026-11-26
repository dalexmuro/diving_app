import {
  type AppRepository,
  type DivePatch,
  type DiverProfileRecord,
  type UserSettingsRecord,
} from '../db/repository';
import { parseSuuntoFit } from '../fit/parser';
import {
  type AuthEnv,
  OAUTH_STATE_COOKIE_NAME,
  base64UrlDecode,
  base64UrlEncode,
  buildCookie,
  parseCookies,
  requireAuth,
  signJwt,
  verifyJwt,
} from '../middleware/auth';
import {
  isAllowedFfessmUrl,
  parseFfessmAttestationPdf,
  parseFfessmInfoHtml,
} from '../services/ffessmSync';
import {
  type R2Archiver,
  type SuuntoEnv,
  buildSuuntoAuthorizeUrl,
  exchangeSuuntoCode,
  ingestFitBytes,
  syncSuuntoWorkouts,
} from '../services/suuntoSync';
import { type FetchLike } from './auth';

export type FullBackendEnv = AuthEnv & SuuntoEnv;

function getOrigin(request: Request, env: AuthEnv): string {
  return env.APP_ORIGIN?.replace(/\/$/, '') || new URL(request.url).origin;
}

async function extractFitBytesFromRequest(request: Request): Promise<Uint8Array | null> {
  const contentType = request.headers.get('Content-Type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return null;
    return new Uint8Array(await file.arrayBuffer());
  }
  const buf = await request.arrayBuffer();
  return buf.byteLength > 0 ? new Uint8Array(buf) : null;
}

export async function handleApiRoutes(params: {
  request: Request;
  env: FullBackendEnv;
  repo: AppRepository;
  bucket: R2Archiver;
  fetcher?: FetchLike;
}): Promise<Response | null> {
  const { request, env, repo, bucket, fetcher = fetch } = params;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const origin = getOrigin(request, env);
  const secure = origin.startsWith('https://');

  // Public Webhook from Suunto Cloud API (authenticated via shared webhook secret)
  if (method === 'POST' && path === '/api/webhooks/suunto') {
    const providedSecret =
      request.headers.get('Ocp-Apim-Subscription-Key') ||
      request.headers.get('X-Webhook-Secret') ||
      url.searchParams.get('secret');
    if (!env.SUUNTO_WEBHOOK_SECRET || providedSecret !== env.SUUNTO_WEBHOOK_SECRET) {
      return Response.json({ error: 'Invalid webhook secret' }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { workoutKey?: string };
    const result = await syncSuuntoWorkouts({
      repo,
      bucket,
      env,
      workoutKeyFilter: body.workoutKey,
      fetcher,
    });
    return Response.json({ ok: true, ...result });
  }

  if (!path.startsWith('/api/')) return null;

  const authCheck = await requireAuth(request, env);
  if ('response' in authCheck) return authCheck.response;

  // --- Suunto OAuth & Sync ---
  if (method === 'GET' && path === '/api/suunto/status') {
    const tokens = await repo.getSuuntoTokens();
    return Response.json({
      connected: Boolean(tokens),
      expiresAt: tokens?.expires_at ?? null,
    });
  }

  if (method === 'GET' && path === '/api/suunto/connect') {
    const raw = new Uint8Array(24);
    crypto.getRandomValues(raw);
    const nonce = base64UrlEncode(raw);
    const stateJwt = await signJwt(
      { sub: 'suunto_oauth', email: env.APP_USER_EMAIL, purpose: 'oauth_state', nonce },
      env.APP_JWT_SECRET,
      600,
    );
    return new Response(null, {
      status: 302,
      headers: {
        Location: buildSuuntoAuthorizeUrl(env, origin, nonce),
        'Set-Cookie': buildCookie(OAUTH_STATE_COOKIE_NAME, stateJwt, 600, secure),
      },
    });
  }

  if (method === 'GET' && path === '/api/suunto/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const stateToken = parseCookies(request.headers.get('Cookie'))[OAUTH_STATE_COOKIE_NAME];
    const verified = stateToken ? await verifyJwt(stateToken, env.APP_JWT_SECRET) : null;
    if (!code || !state || !verified || verified.nonce !== state) {
      return Response.json({ error: 'Invalid Suunto OAuth state' }, { status: 400 });
    }
    const tokens = await exchangeSuuntoCode(code, env, origin, fetcher);
    await repo.saveSuuntoTokens(tokens);
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}/?suunto=connected`,
        'Set-Cookie': buildCookie(OAUTH_STATE_COOKIE_NAME, '', 0, secure),
      },
    });
  }

  if (method === 'DELETE' && path === '/api/suunto/disconnect') {
    await repo.clearSuuntoTokens();
    return Response.json({ ok: true });
  }

  if (method === 'POST' && path === '/api/sync/suunto') {
    try {
      const result = await syncSuuntoWorkouts({ repo, bucket, env, fetcher });
      return Response.json({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Suunto sync error';
      return Response.json({ error: message }, { status: 400 });
    }
  }

  // --- Draft FIT Parse (no DB/R2 write until user saves) ---
  if (method === 'POST' && path === '/api/dives/parse-fit') {
    const fitBytes = await extractFitBytesFromRequest(request);
    if (!fitBytes || fitBytes.length === 0) {
      return Response.json({ error: 'Missing or empty .fit payload' }, { status: 400 });
    }
    try {
      const parsed = await parseSuuntoFit(fitBytes);
      return Response.json({
        ok: true,
        parsed,
        fitBase64: base64UrlEncode(fitBytes),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid FIT file';
      return Response.json({ error: message }, { status: 400 });
    }
  }

  // --- Direct FIT Import ---
  if (method === 'POST' && path === '/api/dives/import-fit') {
    const fitBytes = await extractFitBytesFromRequest(request);
    if (!fitBytes || fitBytes.length === 0) {
      return Response.json({ error: 'Empty .fit payload' }, { status: 400 });
    }
    try {
      const res = await ingestFitBytes({ repo, bucket, fitBytes });
      const dive = await repo.getDiveById(res.diveId);
      return Response.json({ ok: true, created: res.created, dive }, { status: res.created ? 201 : 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid FIT file';
      return Response.json({ error: message }, { status: 400 });
    }
  }

  // --- Dives CRUD ---
  if (method === 'GET' && path === '/api/dives') {
    const dives = await repo.listDives();
    return Response.json({ dives });
  }

  if (method === 'POST' && path === '/api/dives') {
    const body = (await request.json().catch(() => null)) as
      | (DivePatch & { fit_base64?: string })
      | null;
    if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });

    let fitR2Key: string | null = null;
    if (typeof body.fit_base64 === 'string' && body.fit_base64 && body.fit_hash) {
      const fitBytes = base64UrlDecode(body.fit_base64);
      fitR2Key = `manual/${body.fit_hash}.fit`;
      await bucket.put(fitR2Key, fitBytes);
    }

    const dive = await repo.createManualDive({
      ...body,
      fit_r2_key: fitR2Key ?? body.fit_r2_key ?? null,
    });
    return Response.json({ dive }, { status: 201 });
  }

  const diveIdMatch = path.match(/^\/api\/dives\/([^/]+)$/);
  if (diveIdMatch) {
    const id = decodeURIComponent(diveIdMatch[1]);
    if (method === 'GET') {
      const dive = await repo.getDiveById(id);
      if (!dive) return Response.json({ error: 'Dive not found' }, { status: 404 });
      return Response.json({ dive });
    }
    if (method === 'PATCH') {
      const body = (await request.json().catch(() => null)) as DivePatch | null;
      if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
      const dive = await repo.updateDive(id, body);
      if (!dive) return Response.json({ error: 'Dive not found' }, { status: 404 });
      return Response.json({ dive });
    }
    if (method === 'DELETE') {
      const deleted = await repo.deleteDive(id);
      if (!deleted) return Response.json({ error: 'Dive not found' }, { status: 404 });
      return Response.json({ ok: true });
    }
  }

  // --- Global Stats ---
  if (method === 'GET' && path === '/api/stats') {
    const stats = await repo.getGlobalStats();
    return Response.json({ stats });
  }

  // --- Dive Sites ---
  if (method === 'GET' && path === '/api/sites') {
    return Response.json({ sites: await repo.listSites() });
  }
  if (method === 'POST' && path === '/api/sites') {
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      name?: string;
      latitude?: number | null;
      longitude?: number | null;
      country?: string | null;
      notes?: string | null;
    } | null;
    if (!body?.name?.trim()) return Response.json({ error: 'Site name is required' }, { status: 400 });
    const site = await repo.upsertSite({ ...body, name: body.name });
    return Response.json({ site }, { status: 201 });
  }
  const siteIdMatch = path.match(/^\/api\/sites\/([^/]+)$/);
  if (siteIdMatch) {
    const id = decodeURIComponent(siteIdMatch[1]);
    if (method === 'PATCH') {
      const body = (await request.json().catch(() => null)) as {
        name?: string;
        latitude?: number | null;
        longitude?: number | null;
        country?: string | null;
        notes?: string | null;
      } | null;
      if (!body?.name?.trim()) return Response.json({ error: 'Site name is required' }, { status: 400 });
      const site = await repo.upsertSite({ ...body, id, name: body.name });
      return Response.json({ site });
    }
    if (method === 'DELETE') {
      const deleted = await repo.deleteSite(id);
      return deleted
        ? Response.json({ ok: true })
        : Response.json({ error: 'Site not found' }, { status: 404 });
    }
  }

  // --- Dive Centers ---
  if (method === 'GET' && path === '/api/centers') {
    return Response.json({ centers: await repo.listCenters() });
  }
  if (method === 'POST' && path === '/api/centers') {
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      name?: string;
      location_text?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      notes?: string | null;
    } | null;
    if (!body?.name?.trim()) return Response.json({ error: 'Center name is required' }, { status: 400 });
    const center = await repo.upsertCenter({ ...body, name: body.name });
    return Response.json({ center }, { status: 201 });
  }
  const centerIdMatch = path.match(/^\/api\/centers\/([^/]+)$/);
  if (centerIdMatch) {
    const id = decodeURIComponent(centerIdMatch[1]);
    if (method === 'PATCH') {
      const body = (await request.json().catch(() => null)) as {
        name?: string;
        location_text?: string | null;
        latitude?: number | null;
        longitude?: number | null;
        notes?: string | null;
      } | null;
      if (!body?.name?.trim()) return Response.json({ error: 'Center name is required' }, { status: 400 });
      const center = await repo.upsertCenter({ ...body, id, name: body.name });
      return Response.json({ center });
    }
    if (method === 'DELETE') {
      const deleted = await repo.deleteCenter(id);
      return deleted
        ? Response.json({ ok: true })
        : Response.json({ error: 'Center not found' }, { status: 404 });
    }
  }

  // --- Buddies ---
  if (method === 'GET' && path === '/api/buddies') {
    return Response.json({ buddies: await repo.listBuddies() });
  }
  if (method === 'POST' && path === '/api/buddies') {
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      name?: string;
      notes?: string | null;
    } | null;
    if (!body?.name?.trim()) return Response.json({ error: 'Buddy name is required' }, { status: 400 });
    const buddy = await repo.upsertBuddy({ ...body, name: body.name });
    return Response.json({ buddy }, { status: 201 });
  }
  const buddyIdMatch = path.match(/^\/api\/buddies\/([^/]+)$/);
  if (buddyIdMatch) {
    const id = decodeURIComponent(buddyIdMatch[1]);
    if (method === 'PATCH') {
      const body = (await request.json().catch(() => null)) as {
        name?: string;
        notes?: string | null;
      } | null;
      if (!body?.name?.trim()) return Response.json({ error: 'Buddy name is required' }, { status: 400 });
      const buddy = await repo.upsertBuddy({ ...body, id, name: body.name });
      return Response.json({ buddy });
    }
    if (method === 'DELETE') {
      const deleted = await repo.deleteBuddy(id);
      return deleted
        ? Response.json({ ok: true })
        : Response.json({ error: 'Buddy not found' }, { status: 404 });
    }
  }

  // --- Dive Computers ---
  if (method === 'GET' && path === '/api/computers') {
    return Response.json({ computers: await repo.listComputers() });
  }
  if (method === 'POST' && path === '/api/computers') {
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      name?: string;
      brand?: string | null;
      model?: string | null;
      notes?: string | null;
    } | null;
    if (!body?.name?.trim()) return Response.json({ error: 'Computer name is required' }, { status: 400 });
    const computer = await repo.upsertComputer({ ...body, name: body.name });
    return Response.json({ computer }, { status: 201 });
  }
  const compIdMatch = path.match(/^\/api\/computers\/([^/]+)$/);
  if (compIdMatch) {
    const id = decodeURIComponent(compIdMatch[1]);
    if (method === 'PATCH') {
      const body = (await request.json().catch(() => null)) as {
        name?: string;
        brand?: string | null;
        model?: string | null;
        notes?: string | null;
      } | null;
      if (!body?.name?.trim()) return Response.json({ error: 'Computer name is required' }, { status: 400 });
      const computer = await repo.upsertComputer({ ...body, id, name: body.name });
      return Response.json({ computer });
    }
    if (method === 'DELETE') {
      const deleted = await repo.deleteComputer(id);
      return deleted
        ? Response.json({ ok: true })
        : Response.json({ error: 'Computer not found' }, { status: 404 });
    }
  }

  // --- Gear (Name, Brand, Model, Notes) ---
  if (method === 'GET' && path === '/api/gear') {
    return Response.json({ gear: await repo.listGear() });
  }
  if (method === 'POST' && path === '/api/gear') {
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      name?: string;
      category?: string;
      brand?: string | null;
      model?: string | null;
      brand_model?: string | null;
      notes?: string | null;
    } | null;
    if (!body?.name?.trim()) {
      return Response.json({ error: 'Gear name is required' }, { status: 400 });
    }
    const item = await repo.upsertGear({
      id: body.id,
      name: body.name,
      category: body.category,
      brand: body.brand,
      model: body.model,
      brand_model: body.brand_model,
      notes: body.notes,
    });
    return Response.json({ item }, { status: 201 });
  }
  const gearIdMatch = path.match(/^\/api\/gear\/([^/]+)$/);
  if (gearIdMatch) {
    const id = decodeURIComponent(gearIdMatch[1]);
    if (method === 'PATCH') {
      const body = (await request.json().catch(() => null)) as {
        name?: string;
        category?: string;
        brand?: string | null;
        model?: string | null;
        brand_model?: string | null;
        notes?: string | null;
      } | null;
      if (!body?.name?.trim()) return Response.json({ error: 'Gear name is required' }, { status: 400 });
      const item = await repo.upsertGear({ ...body, id, name: body.name });
      return Response.json({ item });
    }
    if (method === 'DELETE') {
      const deleted = await repo.deleteGear(id);
      return deleted
        ? Response.json({ ok: true })
        : Response.json({ error: 'Gear item not found' }, { status: 404 });
    }
  }

  // --- Certifications ---
  if (method === 'GET' && path === '/api/certifications') {
    return Response.json({ certifications: await repo.listCertifications() });
  }
  if (method === 'POST' && path === '/api/certifications') {
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      agency?: string;
      level?: string;
      location?: string | null;
      cert_number?: string | null;
      issued_date?: string | null;
    } | null;
    if (!body?.agency?.trim() || !body?.level?.trim()) {
      return Response.json({ error: 'Agency and level are required' }, { status: 400 });
    }
    const certification = await repo.upsertCertification({
      id: body.id,
      agency: body.agency,
      level: body.level,
      location: body.location,
      cert_number: body.cert_number,
      issued_date: body.issued_date,
    });
    return Response.json({ certification }, { status: 201 });
  }
  const certPdfMatch = path.match(/^\/api\/certifications\/([^/]+)\/pdf$/);
  if (certPdfMatch) {
    const id = decodeURIComponent(certPdfMatch[1]);
    const existing = await repo.getCertificationById(id);
    if (!existing) {
      return Response.json({ error: 'Certification not found' }, { status: 404 });
    }
    if (method === 'GET') {
      if (!existing.pdf_r2_key || !bucket.get) {
        return Response.json({ error: 'PDF not available' }, { status: 404 });
      }
      const obj = await bucket.get(existing.pdf_r2_key);
      if (!obj || !obj.body) {
        return Response.json({ error: 'PDF file not found in storage' }, { status: 404 });
      }
      const safeName = (existing.pdf_filename || `${existing.level}.pdf`).replace(/["\r\n]/g, '');
      return new Response(obj.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${safeName}"`,
        },
      });
    }
    if (method === 'POST') {
      let pdfBytes: Uint8Array | null = null;
      let fileName = `${existing.level}.pdf`;
      const contentType = request.headers.get('Content-Type') || '';
      if (contentType.includes('multipart/form-data')) {
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
          return Response.json({ error: 'Missing PDF file' }, { status: 400 });
        }
        fileName = file.name || fileName;
        pdfBytes = new Uint8Array(await file.arrayBuffer());
      } else {
        const buf = await request.arrayBuffer();
        pdfBytes = buf.byteLength > 0 ? new Uint8Array(buf) : null;
      }
      if (!pdfBytes || pdfBytes.byteLength === 0) {
        return Response.json({ error: 'Empty PDF payload' }, { status: 400 });
      }
      if (pdfBytes.byteLength > 10 * 1024 * 1024) {
        return Response.json({ error: 'PDF exceeds 10 MB limit' }, { status: 400 });
      }
      const key = `certs/${id}.pdf`;
      await bucket.put(key, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } });
      const parsed = await parseFfessmAttestationPdf(pdfBytes).catch(() => null);
      const nextAgency = parsed?.structure
        ? `FFESSM · ${parsed.structure}`
        : existing.agency;
      const nextLevel =
        parsed?.level && parsed.level.length > existing.level.length
          ? parsed.level
          : existing.level;
      const nextLocation = parsed?.location || existing.location;
      const nextIssuedDate = parsed?.issuedDate || existing.issued_date;
      const certification = await repo.upsertCertification({
        id,
        agency: nextAgency,
        level: nextLevel,
        location: nextLocation,
        issued_date: nextIssuedDate,
        pdf_r2_key: key,
        pdf_filename: fileName,
      });
      return Response.json({ certification, parsed });
    }
  }
  const certIdMatch = path.match(/^\/api\/certifications\/([^/]+)$/);
  if (certIdMatch) {
    const id = decodeURIComponent(certIdMatch[1]);
    if (method === 'PATCH') {
      const body = (await request.json().catch(() => null)) as {
        agency?: string;
        level?: string;
        location?: string | null;
        cert_number?: string | null;
        issued_date?: string | null;
      } | null;
      if (!body?.agency?.trim() || !body?.level?.trim()) {
        return Response.json({ error: 'Agency and level are required' }, { status: 400 });
      }
      const certification = await repo.upsertCertification({
        ...body,
        id,
        agency: body.agency,
        level: body.level,
      });
      return Response.json({ certification });
    }
    if (method === 'DELETE') {
      const existing = await repo.getCertificationById(id);
      const deleted = await repo.deleteCertification(id);
      if (deleted && existing?.pdf_r2_key && bucket.delete) {
        await bucket.delete(existing.pdf_r2_key).catch(() => undefined);
      }
      return deleted
        ? Response.json({ ok: true })
        : Response.json({ error: 'Certification not found' }, { status: 404 });
    }
  }

  // --- Diver Profile & License ---
  if (method === 'GET' && path === '/api/profile') {
    const p = await repo.getProfile();
    return Response.json({
      profile: { ...p, ffessm_info_url: p.ffessm_info_url ? 'configured' : null },
    });
  }
  if (method === 'POST' && path === '/api/profile/sync-ffessm') {
    const current = await repo.getProfile();
    const body = (await request.json().catch(() => ({}))) as { url?: string };
    const targetUrl = body.url?.trim() || current.ffessm_info_url || '';
    if (!targetUrl || !isAllowedFfessmUrl(targetUrl)) {
      return Response.json(
        { error: 'Valid FFESSM InfoLicencie URL is not configured' },
        { status: 400 },
      );
    }
    const res = await fetcher(targetUrl, {
      headers: { 'User-Agent': 'DivingLogbook/1.0 (+Cloudflare-Workers)' },
    });
    if (!res.ok) {
      return Response.json(
        { error: `FFESSM fetch failed (${res.status})` },
        { status: 502 },
      );
    }
    const html = await res.text();
    const parsed = parseFfessmInfoHtml(html);

    const updatedProfile = await repo.updateProfile({
      full_name: parsed.fullName ?? current.full_name,
      birth_date: parsed.birthDate ?? current.birth_date,
      federation: parsed.federation,
      license_number: parsed.licenseNumber ?? current.license_number,
      license_category: parsed.licenseCategory ?? current.license_category,
      valid_from: parsed.validFrom ?? current.valid_from,
      valid_until: parsed.validUntil ?? current.valid_until,
      club_name: parsed.clubName ?? current.club_name,
      club_number: parsed.clubNumber ?? current.club_number,
      insurance: parsed.insurance ?? current.insurance,
      insurance_valid_until: parsed.insuranceValidUntil ?? current.insurance_valid_until,
      medical_cert_status: parsed.medicalCertStatus ?? current.medical_cert_status,
      ffessm_info_url: targetUrl,
      last_synced_at: new Date().toISOString(),
    });

    // Reconcile certifications from FFESSM brevets (preserving existing agency & R2 PDFs)
    const existingCerts = await repo.listCertifications();
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    let newCertificationsCount = 0;
    for (const brevet of parsed.brevets) {
      const bNorm = norm(brevet.level);
      const matched = existingCerts.find((c) => {
        const cNorm = norm(c.level);
        const levelMatch =
          cNorm === bNorm || cNorm.startsWith(`${bNorm} `) || cNorm.startsWith(`${bNorm}/`) || bNorm.startsWith(`${cNorm} `);
        if (brevet.issuedDate && c.issued_date) {
          return levelMatch && c.issued_date === brevet.issuedDate;
        }
        return levelMatch;
      });
      if (matched) {
        await repo.upsertCertification({
          id: matched.id,
          agency: matched.agency,
          level: matched.level,
          location: brevet.location ?? matched.location,
          issued_date: brevet.issuedDate ?? matched.issued_date,
          pdf_r2_key: matched.pdf_r2_key,
          pdf_filename: matched.pdf_filename,
        });
      } else {
        await repo.upsertCertification({
          agency: '',
          level: brevet.level,
          location: brevet.location,
          issued_date: brevet.issuedDate,
        });
        newCertificationsCount++;
      }
    }

    const certifications = await repo.listCertifications();
    return Response.json({
      profile: {
        ...updatedProfile,
        ffessm_info_url: updatedProfile.ffessm_info_url ? 'configured' : null,
      },
      certifications,
      newCertificationsCount,
    });
  }
  if (method === 'PATCH' && path === '/api/profile') {
    const body = (await request.json().catch(() => null)) as Partial<DiverProfileRecord> | null;
    if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    const profile = await repo.updateProfile(body);
    return Response.json({ profile });
  }
  if (path === '/api/profile/license-pdf') {
    if (method === 'GET') {
      const profile = await repo.getProfile();
      if (!profile.license_pdf_r2_key || !bucket.get) {
        return Response.json({ error: 'License PDF not available' }, { status: 404 });
      }
      const obj = await bucket.get(profile.license_pdf_r2_key);
      if (!obj || !obj.body) {
        return Response.json({ error: 'License PDF not found in storage' }, { status: 404 });
      }
      const safeName = (profile.license_pdf_filename || 'Attestation Licence.pdf').replace(/["\r\n]/g, '');
      return new Response(obj.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${safeName}"`,
        },
      });
    }
    if (method === 'POST') {
      let pdfBytes: Uint8Array | null = null;
      let fileName = 'Attestation Licence.pdf';
      const contentType = request.headers.get('Content-Type') || '';
      if (contentType.includes('multipart/form-data')) {
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
          return Response.json({ error: 'Missing PDF file' }, { status: 400 });
        }
        fileName = file.name || fileName;
        pdfBytes = new Uint8Array(await file.arrayBuffer());
      } else {
        const buf = await request.arrayBuffer();
        pdfBytes = buf.byteLength > 0 ? new Uint8Array(buf) : null;
      }
      if (!pdfBytes || pdfBytes.byteLength === 0) {
        return Response.json({ error: 'Empty PDF payload' }, { status: 400 });
      }
      if (pdfBytes.byteLength > 10 * 1024 * 1024) {
        return Response.json({ error: 'PDF exceeds 10 MB limit' }, { status: 400 });
      }
      const key = 'profile/license.pdf';
      await bucket.put(key, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } });
      const profile = await repo.updateProfile({
        license_pdf_r2_key: key,
        license_pdf_filename: fileName,
      });
      return Response.json({ profile });
    }
  }
  if (method === 'GET' && path === '/api/profile/license-qr') {
    const profile = await repo.getProfile();
    if (!profile.license_qr_r2_key || !bucket.get) {
      return Response.json({ error: 'License QR not available' }, { status: 404 });
    }
    const obj = await bucket.get(profile.license_qr_r2_key);
    if (!obj || !obj.body) {
      return Response.json({ error: 'License QR not found in storage' }, { status: 404 });
    }
    const isSvg = profile.license_qr_r2_key.endsWith('.svg');
    return new Response(obj.body, {
      status: 200,
      headers: {
        'Content-Type': isSvg ? 'image/svg+xml' : 'image/png',
      },
    });
  }

  // --- User Settings ---
  if (method === 'GET' && path === '/api/settings') {
    return Response.json({ settings: await repo.getSettings() });
  }
  if (method === 'PATCH' && path === '/api/settings') {
    const body = (await request.json().catch(() => null)) as Partial<UserSettingsRecord> | null;
    if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    const settings = await repo.updateSettings(body);
    return Response.json({ settings });
  }

  return null;
}

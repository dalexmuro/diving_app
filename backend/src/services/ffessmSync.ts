export interface ParsedFfessmBrevet {
  level: string;
  location: string | null;
  issuedDate: string | null;
}

export interface ParsedFfessmInfo {
  fullName: string | null;
  birthDate: string | null;
  federation: string;
  licenseNumber: string | null;
  licenseCategory: string | null;
  validFrom: string | null;
  validUntil: string | null;
  clubName: string | null;
  clubNumber: string | null;
  insurance: string | null;
  insuranceValidUntil: string | null;
  medicalCertStatus: string | null;
  brevets: ParsedFfessmBrevet[];
}

export interface ParsedFfessmAttestation {
  level: string | null;
  structure: string | null;
  location: string | null;
  issuedDate: string | null;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function frDateToIso(frDate: string | null | undefined): string | null {
  if (!frDate) return null;
  const m = frDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function extractCardBody(html: string, headerFragment: string): string | null {
  const escaped = headerFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<div[^>]*class="[^"]*card-header[^"]*"[^>]*>[^<]*${escaped}[^<]*<\\/div>\\s*<div[^>]*class="[^"]*card-body[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`,
    'i',
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractParagraphs(cardBody: string): Array<{ cls: string; text: string }> {
  const out: Array<{ cls: string; text: string }> = [];
  const re = /<p([^>]*)>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cardBody)) !== null) {
    const clsMatch = m[1].match(/class="([^"]*)"/i);
    const text = stripTags(m[2]);
    if (text) {
      out.push({ cls: clsMatch ? clsMatch[1] : '', text });
    }
  }
  return out;
}

function findValueAfterLabel(
  paragraphs: Array<{ cls: string; text: string }>,
  labelMatch: RegExp,
): string | null {
  for (let i = 0; i < paragraphs.length - 1; i++) {
    if (labelMatch.test(paragraphs[i].text)) {
      return paragraphs[i + 1].text;
    }
  }
  return null;
}

/**
 * Parses the official FFESSM InfoLicencie HTML page
 * (https://infolicencie.ffessm.fr/Home/InfoLicence?number=...&key=...).
 */
export function parseFfessmInfoHtml(html: string): ParsedFfessmInfo {
  // 1. Diver info
  let fullName: string | null = null;
  let birthDate: string | null = null;
  const diverBody = extractCardBody(html, 'Information sur le plongeur');
  if (diverBody) {
    const ps = extractParagraphs(diverBody);
    if (ps[0]) {
      fullName = ps[0].text.replace(/^(Mr|Mme|Mlle|M\.)\s+/i, '').trim() || null;
    }
    const dobLine = ps.find((p) => /N[ée]\(e\)\s+le/i.test(p.text));
    if (dobLine) {
      birthDate = frDateToIso(dobLine.text);
    }
  }

  // 2. License info
  let licenseNumber: string | null = null;
  let licenseCategory: string | null = null;
  let validFrom: string | null = null;
  let validUntil: string | null = null;
  let clubName: string | null = null;
  let clubNumber: string | null = null;
  const licBody = extractCardBody(html, 'Information sur la licence');
  if (licBody) {
    const ps = extractParagraphs(licBody);
    licenseNumber = findValueAfterLabel(ps, /Licence\s*N/i);
    licenseCategory = findValueAfterLabel(ps, /Type de licence/i);
    validFrom = frDateToIso(findValueAfterLabel(ps, /Date de souscription/i));
    validUntil = frDateToIso(findValueAfterLabel(ps, /Date de validit/i));
    const clubRaw = findValueAfterLabel(ps, /Structure de plong/i);
    if (clubRaw) {
      const clubMatch = clubRaw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (clubMatch) {
        clubName = clubMatch[1].trim();
        clubNumber = clubMatch[2].trim();
      } else {
        clubName = clubRaw.trim();
      }
    }
  }

  // 3. Insurance info
  let insurance: string | null = null;
  let insuranceValidUntil: string | null = null;
  const insBody = extractCardBody(html, "Information sur l'assurance");
  if (insBody) {
    const ps = extractParagraphs(insBody);
    insurance = findValueAfterLabel(ps, /^Assurance$/i);
    insuranceValidUntil = frDateToIso(findValueAfterLabel(ps, /Date de validit/i));
  }

  // 4. Medical certificate (CACI)
  let medicalCertStatus: string | null = null;
  const medBody = extractCardBody(html, 'Information sur le certificat medical');
  if (medBody) {
    const ps = extractParagraphs(medBody);
    medicalCertStatus = ps[0]?.text ?? null;
  }

  // 5. Brevets / Certifications
  const brevets: ParsedFfessmBrevet[] = [];
  const brevBody = extractCardBody(html, 'Information sur les brevets');
  if (brevBody) {
    const ps = extractParagraphs(brevBody);
    for (let i = 0; i < ps.length; i++) {
      if (ps[i].cls.includes('font-weight-bold')) {
        const level = ps[i].text;
        let location: string | null = null;
        let issuedDate: string | null = null;
        const next = ps[i + 1];
        if (next && !next.cls.includes('font-weight-bold')) {
          const detailMatch = next.text.match(/D[ée]livr[ée]\s+[àa]\s+(.+?)\s+le\s+(\d{2}\/\d{2}\/\d{4})/i);
          if (detailMatch) {
            location = detailMatch[1].trim();
            issuedDate = frDateToIso(detailMatch[2]);
          } else {
            issuedDate = frDateToIso(next.text);
          }
          i++;
        }
        brevets.push({ level, location, issuedDate });
      }
    }
  }

  return {
    fullName,
    birthDate,
    federation: 'FFESSM',
    licenseNumber,
    licenseCategory,
    validFrom,
    validUntil,
    clubName,
    clubNumber,
    insurance,
    insuranceValidUntil,
    medicalCertStatus,
    brevets,
  };
}

export function isAllowedFfessmUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return u.protocol === 'https:' && u.hostname.toLowerCase() === 'infolicencie.ffessm.fr';
  } catch {
    return false;
  }
}

async function inflateFlate(data: Uint8Array): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    await writer.write(data as unknown as BufferSource);
    await writer.close();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    return new TextDecoder('latin1').decode(merged);
  } catch {
    return null;
  }
}

function parseToUnicodeCmap(cmapText: string): Map<number, string> {
  const map = new Map<number, string>();
  const rangeBlocks = cmapText.match(/beginbfrange[\s\S]*?endbfrange/g) ?? [];
  for (const block of rangeBlocks) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) {
      const start = parseInt(m[1], 16);
      const end = parseInt(m[2], 16);
      let target = parseInt(m[3], 16);
      for (let code = start; code <= end; code++) {
        map.set(code, String.fromCodePoint(target++));
      }
    }
  }
  const charBlocks = cmapText.match(/beginbfchar[\s\S]*?endbfchar/g) ?? [];
  for (const block of charBlocks) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) {
      const src = parseInt(m[1], 16);
      const dstHex = m[2];
      let out = '';
      for (let i = 0; i < dstHex.length; i += 4) {
        out += String.fromCodePoint(parseInt(dstHex.slice(i, i + 4), 16));
      }
      map.set(src, out);
    }
  }
  return map;
}

function decodeHexString(hex: string, cmap: Map<number, string>): string {
  const clean = hex.replace(/\s+/g, '');
  let out = '';
  for (let i = 0; i + 3 < clean.length; i += 4) {
    const code = parseInt(clean.slice(i, i + 4), 16);
    out += cmap.get(code) ?? '';
  }
  return out;
}

/**
 * Pure zero-dependency PDF text extractor for FFESSM attestation PDFs.
 * Supports FlateDecode streams with ToUnicode CMaps as generated by FFESSM.
 */
export async function parseFfessmAttestationPdf(
  pdfBytes: Uint8Array,
): Promise<ParsedFfessmAttestation> {
  const raw = new TextDecoder('latin1').decode(pdfBytes);
  const streams: string[] = [];

  let cursor = 0;
  while (true) {
    const sIdx = raw.indexOf('stream', cursor);
    if (sIdx === -1) break;
    let dataStart = sIdx + 6;
    if (raw[dataStart] === '\r' && raw[dataStart + 1] === '\n') dataStart += 2;
    else if (raw[dataStart] === '\n') dataStart += 1;
    const eIdx = raw.indexOf('endstream', dataStart);
    if (eIdx === -1) break;
    const slice = pdfBytes.slice(dataStart, eIdx);
    const inflated = await inflateFlate(slice);
    if (inflated) {
      streams.push(inflated);
    } else {
      streams.push(raw.slice(dataStart, eIdx));
    }
    cursor = eIdx + 9;
  }

  const cmap = new Map<number, string>();
  for (const s of streams) {
    if (s.includes('begincmap')) {
      for (const [k, v] of parseToUnicodeCmap(s).entries()) {
        cmap.set(k, v);
      }
    }
  }

  const lines: string[] = [];
  for (const s of streams) {
    if (!s.includes('BT') || !s.includes('ET')) continue;
    const btBlocks = s.match(/BT[\s\S]*?ET/g) ?? [];
    for (const block of btBlocks) {
      const hexMatches = [...block.matchAll(/<([0-9a-fA-F\s]+)>\s*Tj/g)];
      if (hexMatches.length > 0) {
        const decoded = hexMatches
          .map((m) => decodeHexString(m[1], cmap))
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
        if (decoded) lines.push(decoded);
      }
      const asciiMatches = [...block.matchAll(/\(([^()]*)\)\s*Tj/g)];
      if (asciiMatches.length > 0) {
        const decoded = asciiMatches
          .map((m) => m[1])
          .join('')
          .replace(/\s+/g, ' ')
          .trim();
        if (decoded) lines.push(decoded);
      }
    }
  }

  const fullText = lines.join('\n');
  const structureMatch = fullText.match(/Structure\s*:\s*([^\n]+)/i);
  const locMatch = fullText.match(/Lieu\s+d['’]examen\s*:\s*([^\n]+)/i);
  const dateMatch = fullText.match(/Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);

  let level: string | null = null;
  const attIdx = lines.findIndex((l) => /^ATTESTATION$/i.test(l));
  if (attIdx >= 0 && lines[attIdx + 1]) {
    level = lines[attIdx + 1].trim();
  }

  return {
    level,
    structure: structureMatch ? structureMatch[1].trim() : null,
    location: locMatch ? locMatch[1].trim() : null,
    issuedDate: dateMatch ? frDateToIso(dateMatch[1]) : null,
  };
}

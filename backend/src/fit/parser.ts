import { type TelemetrySample, calculateAscentRates } from '../services/metrics';

const FIT_EPOCH_MS = Date.UTC(1989, 11, 31, 0, 0, 0);
const utf8Decoder = new TextDecoder('utf-8');

export type GasType = 'air' | 'nitrox' | 'trimix';

export interface ParsedFitDive {
  fitHash: string;
  computerName: string | null;
  siteDescription: string | null;
  startedAt: string;
  endedAt: string | null;
  durationS: number;
  diveNumberInSeries: number | null;
  surfaceTimeS: number | null;
  maxDepthM: number;
  avgDepthM: number | null;
  minTempC: number | null;
  avgTempC: number | null;
  gasType: GasType;
  o2Pct: number;
  hePct: number;
  gfLow: number | null;
  gfHigh: number | null;
  startPressureBar: number | null;
  endPressureBar: number | null;
  samples: TelemetrySample[];
}

interface FieldDef {
  num: number;
  size: number;
  baseType: number;
}

interface DevFieldDef {
  num: number;
  size: number;
  devIdx: number;
}

interface LocalDef {
  le: boolean;
  globalMsg: number;
  fields: FieldDef[];
  devFields: DevFieldDef[];
}

interface DevFieldDesc {
  devIdx: number;
  fieldNum: number;
  name: string;
  baseType: number;
}

function readScalar(
  view: DataView,
  bytes: Uint8Array,
  offset: number,
  size: number,
  baseType: number,
  le: boolean,
): number | string | null {
  if (baseType === 0x07) {
    const slice = bytes.subarray(offset, offset + size);
    const nulIdx = slice.indexOf(0);
    const clean = nulIdx >= 0 ? slice.subarray(0, nulIdx) : slice;
    return utf8Decoder.decode(clean);
  }
  switch (baseType) {
    case 0x00:
    case 0x02:
    case 0x0d: {
      const v = view.getUint8(offset);
      return v === 0xff ? null : v;
    }
    case 0x0a: {
      const v = view.getUint8(offset);
      return v === 0x00 ? null : v;
    }
    case 0x01: {
      const v = view.getInt8(offset);
      return v === 0x7f ? null : v;
    }
    case 0x83: {
      const v = view.getInt16(offset, le);
      return v === 0x7fff ? null : v;
    }
    case 0x84: {
      const v = view.getUint16(offset, le);
      return v === 0xffff ? null : v;
    }
    case 0x8b: {
      const v = view.getUint16(offset, le);
      return v === 0x0000 ? null : v;
    }
    case 0x85: {
      const v = view.getInt32(offset, le);
      return v === 0x7fffffff ? null : v;
    }
    case 0x86: {
      const v = view.getUint32(offset, le);
      return v === 0xffffffff ? null : v;
    }
    case 0x8c: {
      const v = view.getUint32(offset, le);
      return v === 0x00000000 ? null : v;
    }
    case 0x88: {
      const v = view.getFloat32(offset, le);
      return Number.isNaN(v) ? null : v;
    }
    case 0x89: {
      const v = view.getFloat64(offset, le);
      return Number.isNaN(v) ? null : v;
    }
    default:
      return null;
  }
}

function fitTimestampToIso(fitSeconds: number): string {
  return new Date(FIT_EPOCH_MS + fitSeconds * 1000).toISOString();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function parseSuuntoFit(buffer: ArrayBuffer | Uint8Array): Promise<ParsedFitDive> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 14) {
    throw new Error('Invalid FIT file: too short');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = view.getUint8(0);
  const dataSize = view.getUint32(4, true);
  const magic = utf8Decoder.decode(bytes.subarray(8, 12));

  if ((headerSize !== 12 && headerSize !== 14) || magic !== '.FIT') {
    throw new Error('Invalid FIT file header');
  }
  if (headerSize + dataSize > bytes.length) {
    throw new Error('Invalid FIT file: truncated data section');
  }

  const localDefs = new Map<number, LocalDef>();
  const devDescs = new Map<string, DevFieldDesc>();

  let computerName: string | null = null;
  let siteDescription: string | null = null;
  let startTs: number | null = null;
  let endTs: number | null = null;
  let durationS: number | null = null;
  let maxDepthM: number | null = null;
  let avgDepthM: number | null = null;
  let minTempC: number | null = null;
  let avgTempC: number | null = null;
  let diveNumberInSeries: number | null = null;
  let surfaceTimeS: number | null = null;
  let o2Pct = 21;
  let hePct = 0;
  let gfLow: number | null = null;
  let gfHigh: number | null = null;
  let startPressureBar: number | null = null;
  let endPressureBar: number | null = null;

  const rawRecords: Array<{
    ts: number;
    depthM: number | null;
    tempC: number | null;
    pressureBar: number | null;
  }> = [];

  let pos = headerSize;
  const end = headerSize + dataSize;
  let lastTimestamp = 0;

  while (pos < end) {
    const header = view.getUint8(pos++);
    const isCompressedTs = (header & 0x80) !== 0;

    let localType: number;
    let isDef = false;
    let hasDev = false;
    let compressedOffset: number | null = null;

    if (isCompressedTs) {
      localType = (header >> 5) & 0x03;
      compressedOffset = header & 0x1f;
    } else {
      isDef = (header & 0x40) !== 0;
      hasDev = (header & 0x20) !== 0;
      localType = header & 0x0f;
    }

    if (isDef) {
      pos += 1; // reserved
      const arch = view.getUint8(pos++);
      const le = arch === 0;
      const globalMsg = view.getUint16(pos, le);
      pos += 2;
      const numFields = view.getUint8(pos++);
      const fields: FieldDef[] = [];
      for (let i = 0; i < numFields; i++) {
        fields.push({
          num: view.getUint8(pos++),
          size: view.getUint8(pos++),
          baseType: view.getUint8(pos++),
        });
      }
      const devFields: DevFieldDef[] = [];
      if (hasDev) {
        const numDev = view.getUint8(pos++);
        for (let i = 0; i < numDev; i++) {
          devFields.push({
            num: view.getUint8(pos++),
            size: view.getUint8(pos++),
            devIdx: view.getUint8(pos++),
          });
        }
      }
      localDefs.set(localType, { le, globalMsg, fields, devFields });
      continue;
    }

    const def = localDefs.get(localType);
    if (!def) {
      throw new Error(`FIT parse error: missing definition for local message ${localType}`);
    }

    const fieldsMap = new Map<number, number | string>();
    for (const f of def.fields) {
      const val = readScalar(view, bytes, pos, f.size, f.baseType, def.le);
      if (val !== null) fieldsMap.set(f.num, val);
      pos += f.size;
    }

    const devValues = new Map<string, number | string>();
    for (const df of def.devFields) {
      const desc = devDescs.get(`${df.devIdx}:${df.num}`);
      if (desc) {
        const val = readScalar(view, bytes, pos, df.size, desc.baseType, def.le);
        if (val !== null) devValues.set(desc.name, val);
      }
      pos += df.size;
    }

    const msgTs = fieldsMap.get(253);
    if (typeof msgTs === 'number') {
      lastTimestamp = msgTs;
    } else if (compressedOffset !== null) {
      const delta = (compressedOffset - (lastTimestamp & 0x1f)) & 0x1f;
      lastTimestamp += delta;
    }

    switch (def.globalMsg) {
      case 0: {
        // file_id
        const prodName = fieldsMap.get(8);
        if (typeof prodName === 'string' && prodName.trim()) {
          computerName = prodName.trim();
        }
        break;
      }
      case 23: {
        // device_info
        const prodName = fieldsMap.get(27);
        if (typeof prodName === 'string' && prodName.trim()) {
          computerName = prodName.trim();
        }
        break;
      }
      case 206: {
        // field_description
        const devIdx = fieldsMap.get(0);
        const fieldNum = fieldsMap.get(1);
        const baseType = fieldsMap.get(2);
        const name = fieldsMap.get(3);
        if (
          typeof devIdx === 'number' &&
          typeof fieldNum === 'number' &&
          typeof baseType === 'number' &&
          typeof name === 'string'
        ) {
          devDescs.set(`${devIdx}:${fieldNum}`, { devIdx, fieldNum, baseType, name });
        }
        break;
      }
      case 18: {
        // session
        const sStart = fieldsMap.get(2);
        const sEnd = fieldsMap.get(253);
        const elapsedMs = fieldsMap.get(7) ?? fieldsMap.get(8);
        const sAvgDepthMm = fieldsMap.get(140);
        const sMaxDepthMm = fieldsMap.get(141);
        const sAvgTemp = fieldsMap.get(57);
        const sMinTemp = fieldsMap.get(58);

        if (typeof sStart === 'number') startTs = sStart;
        if (typeof sEnd === 'number') endTs = sEnd;
        if (typeof elapsedMs === 'number') durationS = Math.round(elapsedMs / 1000);
        if (typeof sAvgDepthMm === 'number') avgDepthM = round2(sAvgDepthMm / 1000);
        if (typeof sMaxDepthMm === 'number') maxDepthM = round2(sMaxDepthMm / 1000);
        if (typeof sAvgTemp === 'number') avgTempC = sAvgTemp;
        if (typeof sMinTemp === 'number') minTempC = sMinTemp;

        const desc = devValues.get('description');
        if (typeof desc === 'string' && desc.trim()) siteDescription = desc.trim();
        const devMaxDepth = devValues.get('max_depth');
        if (maxDepthM === null && typeof devMaxDepth === 'number') maxDepthM = round2(devMaxDepth);
        const devDiveNum = devValues.get('dive_number_in_series');
        if (typeof devDiveNum === 'number') diveNumberInSeries = devDiveNum;
        const devSurface = devValues.get('surface_time');
        if (typeof devSurface === 'number') surfaceTimeS = Math.round(devSurface);
        break;
      }
      case 20: {
        // record
        const ts = typeof msgTs === 'number' ? msgTs : lastTimestamp;
        const depthMm = fieldsMap.get(92);
        const tempC = fieldsMap.get(13);
        rawRecords.push({
          ts,
          depthM: typeof depthMm === 'number' ? round2(depthMm / 1000) : null,
          tempC: typeof tempC === 'number' ? tempC : null,
          pressureBar: null,
        });
        break;
      }
      case 258: {
        // dive_settings
        const low = fieldsMap.get(2);
        const high = fieldsMap.get(3);
        if (typeof low === 'number') gfLow = low;
        if (typeof high === 'number') gfHigh = high;
        break;
      }
      case 259: {
        // dive_gas
        const he = fieldsMap.get(0);
        const o2 = fieldsMap.get(1);
        if (typeof o2 === 'number' && o2 > 0) o2Pct = o2;
        if (typeof he === 'number' && he >= 0) hePct = he;
        break;
      }
      case 286: {
        // tank_summary (when present on Tank POD exports)
        const pStart = fieldsMap.get(1);
        const pEnd = fieldsMap.get(2);
        if (typeof pStart === 'number') startPressureBar = round2(pStart / 100);
        if (typeof pEnd === 'number') endPressureBar = round2(pEnd / 100);
        break;
      }
      default:
        break;
    }
  }

  const baseTs = startTs ?? rawRecords[0]?.ts;
  if (baseTs === undefined) {
    throw new Error('Invalid FIT dive: no timestamp found');
  }

  const normalizedSamples = calculateAscentRates(
    rawRecords.map((r) => ({
      elapsedS: Math.max(0, r.ts - baseTs),
      depthM: r.depthM,
      tempC: r.tempC,
      pressureBar: r.pressureBar,
    })),
  );

  const depthValues = normalizedSamples
    .map((s) => s.depthM)
    .filter((d): d is number => d !== null);
  const computedMaxDepth = depthValues.length > 0 ? Math.max(...depthValues) : 0;
  const computedDuration =
    durationS ??
    (endTs !== null ? Math.max(0, endTs - baseTs) : normalizedSamples.at(-1)?.elapsedS ?? 0);

  const gasType: GasType = hePct > 0 ? 'trimix' : o2Pct > 21 ? 'nitrox' : 'air';

  return {
    fitHash: await sha256Hex(bytes),
    computerName,
    siteDescription,
    startedAt: fitTimestampToIso(baseTs),
    endedAt: endTs !== null ? fitTimestampToIso(endTs) : fitTimestampToIso(baseTs + computedDuration),
    durationS: computedDuration,
    diveNumberInSeries,
    surfaceTimeS,
    maxDepthM: maxDepthM ?? computedMaxDepth,
    avgDepthM,
    minTempC,
    avgTempC,
    gasType,
    o2Pct,
    hePct,
    gfLow,
    gfHigh,
    startPressureBar,
    endPressureBar,
    samples: normalizedSamples,
  };
}

import { describe, expect, it } from 'vitest';
import { parseSuuntoFit } from '../src/fit/parser';

/**
 * Builds a minimal valid synthetic Suunto-style FIT binary buffer for unit testing
 * (contains zero personal data).
 */
function buildSyntheticFit(): Uint8Array {
  const chunks: number[] = [];
  const pushU16LE = (v: number) => chunks.push(v & 0xff, (v >> 8) & 0xff);
  const pushU32LE = (v: number) =>
    chunks.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  const pushStr = (s: string, len: number) => {
    const bytes = new TextEncoder().encode(s);
    for (let i = 0; i < len; i++) chunks.push(bytes[i] ?? 0);
  };

  // Def local 0 -> file_id (global 0): field 8 (string, 16 bytes)
  chunks.push(0x40, 0, 0);
  pushU16LE(0);
  chunks.push(1, 8, 16, 0x07);
  // Data local 0 -> "Suunto Nautic"
  chunks.push(0x00);
  pushStr('Suunto Nautic', 16);

  // Def local 1 -> dive_gas (global 259): field 0 (he, u8), field 1 (o2, u8)
  chunks.push(0x41, 0, 0);
  pushU16LE(259);
  chunks.push(2, 0, 1, 0x02, 1, 1, 0x02);
  // Data local 1 -> EAN32 (0% He, 32% O2)
  chunks.push(0x01, 0, 32);

  // Def local 2 -> dive_settings (global 258): field 2 (gf_low u8), field 3 (gf_high u8)
  chunks.push(0x42, 0, 0);
  pushU16LE(258);
  chunks.push(2, 2, 1, 0x02, 3, 1, 0x02);
  // Data local 2 -> GF 40/85
  chunks.push(0x02, 40, 85);

  // Def local 3 -> field_description (global 206): f0(devIdx u8), f1(fNum u8), f2(baseType u8), f3(name str 12)
  chunks.push(0x43, 0, 0);
  pushU16LE(206);
  chunks.push(4, 0, 1, 0x02, 1, 1, 0x02, 2, 1, 0x02, 3, 12, 0x07);
  // Data local 3 -> devIdx=0, fNum=1, baseType=0x07 (string), name="description"
  chunks.push(0x03, 0, 1, 0x07);
  pushStr('description', 12);

  // Def local 4 -> session (global 18) with dev field (0,1,12)
  chunks.push(0x64, 0, 0); // hasDev = 0x20 | isDef = 0x40 | local 4
  pushU16LE(18);
  chunks.push(
    6,
    2, 4, 0x86, // start_time
    253, 4, 0x86, // end_time
    7, 4, 0x86, // elapsed ms
    140, 4, 0x86, // avg_depth mm
    141, 4, 0x86, // max_depth mm
    58, 1, 0x01, // min_temp C
  );
  chunks.push(1, 1, 12, 0); // 1 dev field: fNum=1, size=12, devIdx=0

  // Data local 4 -> start=1000000000, end=1000001800, elapsed=1800000ms, avg=12500mm, max=24000mm, minTemp=19, site="Blue Reef"
  chunks.push(0x04);
  pushU32LE(1000000000);
  pushU32LE(1000001800);
  pushU32LE(1800000);
  pushU32LE(12500);
  pushU32LE(24000);
  chunks.push(19);
  pushStr('Blue Reef', 12);

  // Def local 5 -> record (global 20): f253(ts u32), f92(depth mm u32), f13(temp i8)
  chunks.push(0x45, 0, 0);
  pushU16LE(20);
  chunks.push(3, 253, 4, 0x86, 92, 4, 0x86, 13, 1, 0x01);

  // 3 records: 0s @ 0m, 60s @ 20m, 90s @ 10m (ascent 10m in 30s = 20 m/min)
  const recs = [
    [1000000000, 0, 22],
    [1000000060, 20000, 19],
    [1000000090, 10000, 20],
  ];
  for (const [ts, d, t] of recs) {
    chunks.push(0x05);
    pushU32LE(ts);
    pushU32LE(d);
    chunks.push(t);
  }

  const dataBytes = new Uint8Array(chunks);
  const full = new Uint8Array(14 + dataBytes.length + 2);
  const hv = new DataView(full.buffer);
  hv.setUint8(0, 14); // headerSize
  hv.setUint8(1, 32); // protocolVersion
  hv.setUint16(2, 21176, true); // profileVersion
  hv.setUint32(4, dataBytes.length, true);
  full.set(new TextEncoder().encode('.FIT'), 8);
  full.set(dataBytes, 14);
  return full;
}

describe('parseSuuntoFit', () => {
  it('parses synthetic Suunto FIT dive telemetry, gas, GF, developer site description, and ascent rates', async () => {
    const fit = await parseSuuntoFit(buildSyntheticFit());

    expect(fit.computerName).toBe('Suunto Nautic');
    expect(fit.siteDescription).toBe('Blue Reef');
    expect(fit.durationS).toBe(1800);
    expect(fit.avgDepthM).toBe(12.5);
    expect(fit.maxDepthM).toBe(24);
    expect(fit.minTempC).toBe(19);
    expect(fit.gasType).toBe('nitrox');
    expect(fit.o2Pct).toBe(32);
    expect(fit.hePct).toBe(0);
    expect(fit.gfLow).toBe(40);
    expect(fit.gfHigh).toBe(85);
    expect(fit.fitHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fit.samples).toHaveLength(3);
    expect(fit.samples[2].ascentRateMMin).toBe(20);
  });

  it('rejects invalid or truncated FIT binaries', async () => {
    await expect(parseSuuntoFit(new Uint8Array([1, 2, 3]))).rejects.toThrow('too short');
    const badMagic = new Uint8Array(20);
    badMagic[0] = 14;
    await expect(parseSuuntoFit(badMagic)).rejects.toThrow('Invalid FIT file header');
  });
});

import { AlertTriangle, X } from 'lucide-react';
import {
  type KeyboardEvent,
  type PointerEvent,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePreferences } from '../i18n/I18nContext';
import {
  convertDepth,
  convertTemp,
  formatAscentRate,
  formatDepth,
  formatDuration,
  formatElapsedMmSs,
  formatPressure,
  formatTemp,
} from '../services/units';
import { type DecoStop, type TelemetrySample } from '../types/domain';
import {
  type PlottedProfilePoint,
  buildProfileGeometry,
  interpolateProfilePoint,
} from './profileGeometry';

interface DiveProfileChartProps {
  samples: TelemetrySample[];
  totalDurationS?: number;
  startPressureBar?: number | null;
  endPressureBar?: number | null;
  decoStops?: DecoStop[];
}

interface ChartLayerPrefs {
  showTemp: boolean;
  showAlerts: boolean;
  showSpeed: boolean;
  showPressure: boolean;
  showStops: boolean;
}

const LAYER_STORAGE_KEY = 'diving_chart_layers_v1';

const DEFAULT_LAYERS: ChartLayerPrefs = {
  showTemp: true,
  showAlerts: true,
  showSpeed: false,
  showPressure: false,
  showStops: true,
};

function loadLayerPrefs(): ChartLayerPrefs {
  try {
    const raw = localStorage.getItem(LAYER_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYERS;
    return { ...DEFAULT_LAYERS, ...(JSON.parse(raw) as Partial<ChartLayerPrefs>) };
  } catch {
    return DEFAULT_LAYERS;
  }
}

export const DiveProfileChart = memo(function DiveProfileChart({
  samples,
  totalDurationS,
  startPressureBar,
  endPressureBar,
  decoStops = [],
}: DiveProfileChartProps) {
  const { unitSystem, ascentLimitMMin, t } = usePreferences();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);

  const [selected, setSelected] = useState<PlottedProfilePoint | null>(null);
  const [layers, setLayers] = useState<ChartLayerPrefs>(loadLayerPrefs);
  const [containerWidth, setContainerWidth] = useState(920);

  // Observe container width so SVG coordinate system adapts cleanly to mobile vs desktop
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAYER_STORAGE_KEY, JSON.stringify(layers));
    } catch {
      // Ignore storage quota errors
    }
  }, [layers]);

  const profile = useMemo(
    () => buildProfileGeometry(samples, ascentLimitMMin, startPressureBar, endPressureBar),
    [samples, ascentLimitMMin, startPressureBar, endPressureBar],
  );

  // Adaptive SVG dimensions so axis text remains crisp & readable on 360px Android phones
  const isCompact = containerWidth < 540;
  const svgW = isCompact ? Math.max(340, containerWidth) : 920;
  const svgH = isCompact ? 235 : 330;
  const padLeft = isCompact ? 42 : 54;
  const padRight = isCompact ? 42 : 54;
  const padTop = 18;
  const padBottom = 30;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;

  // Fixed-step depth (every 5 m) and time (every 5 or 10 min) axis ceilings
  const depthStepM = 5;
  const axisMaxDepthM = Math.max(
    depthStepM,
    Math.ceil(Math.max(profile.maxDepthM, 1) / depthStepM) * depthStepM,
  );
  const timeStepMin = isCompact
    ? profile.maxElapsedS <= 25 * 60
      ? 5
      : 10
    : profile.maxElapsedS <= 35 * 60
      ? 5
      : 10;
  const timeStepS = timeStepMin * 60;
  const axisMaxElapsedS = Math.max(
    timeStepS,
    Math.ceil(Math.max(profile.maxElapsedS, 1) / timeStepS) * timeStepS,
  );

  // Precompute all SVG paths in useMemo so scrubbing/tapping never rebuilds path strings
  const geometry = useMemo(() => {
    if (profile.points.length === 0) return null;

    const toX = (p: PlottedProfilePoint) => padLeft + (p.elapsedS / axisMaxElapsedS) * plotW;
    const toY = (p: PlottedProfilePoint) => padTop + (p.depthM / axisMaxDepthM) * plotH;

    const tempPoints = profile.points.filter((p) => p.tempC != null);
    const minTempC =
      tempPoints.length > 0 ? Math.floor(Math.min(...tempPoints.map((p) => p.tempC!)) - 1) : 10;
    const maxTempC =
      tempPoints.length > 0 ? Math.ceil(Math.max(...tempPoints.map((p) => p.tempC!)) + 1) : 25;
    const tempSpan = Math.max(2, maxTempC - minTempC);
    const tempToY = (c: number) => padTop + (1 - (c - minTempC) / tempSpan) * plotH;

    const pressurePoints = profile.points.filter((p) => p.pressureBar != null);
    const maxPressure =
      pressurePoints.length > 0 ? Math.max(200, ...pressurePoints.map((p) => p.pressureBar!)) : 200;
    const pressureToY = (bar: number) => padTop + (1 - bar / maxPressure) * plotH;

    const maxSpeed = Math.max(25, profile.peakAscentRateMMin);
    const speedPoints = profile.points.filter(
      (p) => p.ascentRateMMin != null && p.ascentRateMMin > 0,
    );
    const speedToY = (rate: number) => padTop + (1 - Math.min(1, rate / maxSpeed)) * plotH;

    const areaPath = [
      `M ${toX(profile.points[0]).toFixed(1)} ${padTop}`,
      ...profile.points.map((p) => `L ${toX(p).toFixed(1)} ${toY(p).toFixed(1)}`),
      `L ${toX(profile.points[profile.points.length - 1]).toFixed(1)} ${padTop}`,
      'Z',
    ].join(' ');

    // Merge all curve segments into 2 crisp <path> elements instead of up to 2,800 <line> DOM nodes
    const fullLinePath = profile.points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(p).toFixed(1)} ${toY(p).toFixed(1)}`)
      .join(' ');

    const alertPathParts: string[] = [];
    for (const seg of profile.segments) {
      if (seg.exceedsAscentLimit) {
        alertPathParts.push(
          `M ${toX(seg.from).toFixed(1)} ${toY(seg.from).toFixed(1)} L ${toX(seg.to).toFixed(1)} ${toY(seg.to).toFixed(1)}`,
        );
      }
    }
    const alertPath = alertPathParts.join(' ');

    const tempPath =
      tempPoints.length > 1
        ? tempPoints
            .map(
              (p, idx) =>
                `${idx === 0 ? 'M' : 'L'} ${toX(p).toFixed(1)} ${tempToY(p.tempC!).toFixed(1)}`,
            )
            .join(' ')
        : '';

    const pressurePath =
      pressurePoints.length > 1
        ? pressurePoints
            .map(
              (p, idx) =>
                `${idx === 0 ? 'M' : 'L'} ${toX(p).toFixed(1)} ${pressureToY(p.pressureBar!).toFixed(1)}`,
            )
            .join(' ')
        : '';

    const speedPath =
      speedPoints.length > 1
        ? speedPoints
            .map(
              (p, idx) =>
                `${idx === 0 ? 'M' : 'L'} ${toX(p).toFixed(1)} ${speedToY(p.ascentRateMMin!).toFixed(1)}`,
            )
            .join(' ')
        : '';

    const violationPoints = profile.points.filter((p) => p.exceedsAscentLimit);

    return {
      areaPath,
      fullLinePath,
      alertPath,
      tempPath,
      pressurePath,
      speedPath,
      violationPoints,
      hasTemp: tempPoints.length > 0,
      maxTempC,
      tempSpan,
    };
  }, [profile, padLeft, padTop, plotW, plotH, axisMaxElapsedS, axisMaxDepthM]);

  if (!geometry || profile.points.length === 0) {
    return null;
  }

  const toX = (p: PlottedProfilePoint) => padLeft + (p.elapsedS / axisMaxElapsedS) * plotW;
  const toY = (p: PlottedProfilePoint) => padTop + (p.depthM / axisMaxDepthM) * plotH;

  function selectAtClientX(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;
    const scaleX = svgW / rect.width;
    const svgX = (clientX - rect.left) * scaleX;
    const axisRatio = (svgX - padLeft) / plotW;
    const targetElapsedS = axisRatio * axisMaxElapsedS;
    const pointRatio = profile.maxElapsedS > 0 ? targetElapsedS / profile.maxElapsedS : 0;
    const interpolated = interpolateProfilePoint(profile.points, pointRatio);
    setSelected(interpolated);
  }

  function handlePointerDown(e: PointerEvent<SVGSVGElement>) {
    draggingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors on synthetic events
    }
    selectAtClientX(e.clientX);
  }

  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!draggingRef.current) return;
    selectAtClientX(e.clientX);
  }

  function handlePointerUp(e: PointerEvent<SVGSVGElement>) {
    draggingRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      setSelected(null);
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = Math.max(1, Math.round(profile.points.length / 40));
      const currIdx = selected ? selected.index : 0;
      const nextIdx =
        e.key === 'ArrowRight'
          ? Math.min(profile.points.length - 1, currIdx + step)
          : Math.max(0, currIdx - step);
      setSelected(profile.points[nextIdx]);
    }
  }

  const yDepthTicks: number[] = [];
  for (let d = 0; d <= axisMaxDepthM; d += depthStepM) {
    yDepthTicks.push(d);
  }
  const xTimeTicksS: number[] = [];
  for (let s = 0; s <= axisMaxElapsedS; s += timeStepS) {
    xTimeTicksS.push(s);
  }
  const tempTicks = [0, 0.25, 0.5, 0.75, 1];
  const effectiveTotalDuration = totalDurationS ?? profile.maxElapsedS;

  const toggleLayer = (key: keyof ChartLayerPrefs) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="panel-surface p-4 sm:p-5 space-y-3.5 relative">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{t('diveProfile')}</h2>
        {selected && (
          <button
            type="button"
            aria-label={t('cancel')}
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>{t('cancel')}</span>
          </button>
        )}
      </div>

      {/* Top Telemetry Readout Bar (never overlaps the dive curve, zero layout shift) */}
      <div
        role="status"
        aria-live="polite"
        className={`rounded-xl border px-3.5 py-2.5 min-h-[54px] flex flex-wrap items-center justify-between gap-x-4 gap-y-2 transition-colors ${
          selected
            ? 'border-slate-800 bg-[#0b192c] text-slate-100'
            : 'border-slate-200 bg-slate-50/80 text-slate-500'
        }`}
      >
        {selected ? (
          <>
            <dl className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-1.5 text-xs">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-slate-400">
                  {t('elapsedTime')}
                </dt>
                <dd className="font-semibold text-white tabular-telemetry">
                  {formatElapsedMmSs(selected.elapsedS)}{' '}
                  <span className="font-normal text-slate-400">
                    / {formatDuration(effectiveTotalDuration)}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-slate-400">{t('depth')}</dt>
                <dd className="font-semibold text-sky-300 tabular-telemetry">
                  {formatDepth(selected.depthM, unitSystem)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-slate-400">
                  {t('ascentRate')}
                </dt>
                <dd
                  className={`font-semibold tabular-telemetry ${
                    selected.exceedsAscentLimit ? 'text-red-400' : 'text-white'
                  }`}
                >
                  {formatAscentRate(selected.ascentRateMMin, unitSystem)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-slate-400">
                  {t('waterTemp')}
                </dt>
                <dd className="font-semibold text-emerald-300 tabular-telemetry">
                  {formatTemp(selected.tempC, unitSystem)}
                </dd>
              </div>
              {selected.pressureBar != null && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-slate-400">
                    {t('tankPressure')}
                  </dt>
                  <dd className="font-semibold text-white tabular-telemetry">
                    {formatPressure(selected.pressureBar, unitSystem)}
                  </dd>
                </div>
              )}
            </dl>

            {selected.exceedsAscentLimit && (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-950/80 px-2.5 py-1 text-[11px] font-medium text-red-200 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>
                  {t('ascentAlert')} ({formatAscentRate(ascentLimitMMin, unitSystem)})
                </span>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-500">{t('chartTapHint')}</p>
        )}
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label={t('diveProfile')}
        className="relative select-none rounded-lg focus-visible:outline-2 focus-visible:outline-sky-600"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgW} ${svgH}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: 'pan-y' }}
          className="w-full h-auto max-h-[55dvh] cursor-crosshair overflow-visible"
          role="img"
          aria-label={t('diveProfile')}
        >
          <defs>
            <linearGradient id="diveDepthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.65" />
            </linearGradient>
          </defs>

          {/* Horizontal Depth Gridlines & Left Depth Axis (fixed every 5 m) */}
          {yDepthTicks.map((depthM) => {
            const y = padTop + (depthM / axisMaxDepthM) * plotH;
            const depthVal =
              unitSystem === 'imperial' ? Math.round(convertDepth(depthM, unitSystem)) : depthM;
            return (
              <g key={`y-${depthM}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgW - padRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={depthM === 0 ? undefined : '4 4'}
                />
                <text
                  x={padLeft - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-600 text-[11px] tabular-telemetry"
                >
                  {depthVal}
                  {unitSystem === 'imperial' ? 'ft' : 'm'}
                </text>
              </g>
            );
          })}

          {/* Right Temperature Axis */}
          {layers.showTemp &&
            geometry.hasTemp &&
            tempTicks.map((ratio) => {
              const y = padTop + ratio * plotH;
              const tempC = geometry.maxTempC - ratio * geometry.tempSpan;
              const dispTemp = Math.round(convertTemp(tempC, unitSystem));
              return (
                <text
                  key={`t-${ratio}`}
                  x={svgW - padRight + 6}
                  y={y + 4}
                  textAnchor="start"
                  className="fill-emerald-700 text-[11px] tabular-telemetry"
                >
                  {dispTemp}°{unitSystem === 'imperial' ? 'F' : 'C'}
                </text>
              );
            })}

          {/* Vertical Time Gridlines & Bottom Time Axis (fixed every 5 or 10 min) */}
          {xTimeTicksS.map((sec) => {
            const x = padLeft + (sec / axisMaxElapsedS) * plotW;
            return (
              <g key={`x-${sec}`}>
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={padTop + plotH}
                  stroke="#e2e8f0"
                  strokeOpacity={sec === 0 ? 0.9 : 0.6}
                  strokeDasharray={sec === 0 ? undefined : '3 4'}
                />
                <text
                  x={x}
                  y={svgH - 6}
                  textAnchor="middle"
                  className="fill-slate-600 text-[11px] tabular-telemetry"
                >
                  {formatElapsedMmSs(sec)}
                </text>
              </g>
            );
          })}

          {/* Ocean Depth Gradient Fill */}
          <path d={geometry.areaPath} fill="url(#diveDepthFill)" />

          {/* Deco / Safety Stops Reference Lines */}
          {layers.showStops &&
            decoStops.map((stop, idx) => {
              if (stop.depth_m > axisMaxDepthM) return null;
              const y = padTop + (stop.depth_m / axisMaxDepthM) * plotH;
              return (
                <g key={`stop-${idx}`}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgW - padRight}
                    y2={y}
                    stroke="#7c3aed"
                    strokeWidth={1.25}
                    strokeDasharray="6 4"
                  />
                  <text
                    x={padLeft + 6}
                    y={y - 4}
                    className="fill-violet-700 text-[10px] font-medium tabular-telemetry"
                  >
                    {t('layerStops')}: {formatDepth(stop.depth_m, unitSystem)} · {stop.duration_min}m
                  </text>
                </g>
              );
            })}

          {/* Merged Base Profile Curve (1 DOM node instead of thousands) */}
          <path
            d={geometry.fullLinePath}
            fill="none"
            stroke="#0369a1"
            strokeWidth={2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Merged Ascent Alert Segments (1 DOM node) */}
          {layers.showAlerts && geometry.alertPath && (
            <path
              d={geometry.alertPath}
              fill="none"
              stroke="#dc2626"
              strokeWidth={3.2}
              strokeLinecap="round"
            />
          )}

          {/* Overlaid Green Water Temperature Curve */}
          {layers.showTemp && geometry.tempPath && (
            <path d={geometry.tempPath} fill="none" stroke="#059669" strokeWidth={1.8} />
          )}

          {/* Optional Tank Pressure Curve */}
          {layers.showPressure && geometry.pressurePath && (
            <path
              d={geometry.pressurePath}
              fill="none"
              stroke="#4f46e5"
              strokeWidth={1.6}
              strokeDasharray="5 3"
            />
          )}

          {/* Optional Ascent Speed Overlay */}
          {layers.showSpeed && geometry.speedPath && (
            <path
              d={geometry.speedPath}
              fill="none"
              stroke="#d97706"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          )}

          {/* Red Violation Dots */}
          {layers.showAlerts &&
            geometry.violationPoints.map((p) => (
              <circle
                key={`v-${p.index}`}
                cx={toX(p)}
                cy={toY(p)}
                r={3.8}
                fill="#dc2626"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            ))}

          {/* Selected Point Crosshair & Marker */}
          {selected && (
            <g>
              <line
                x1={toX(selected)}
                y1={padTop}
                x2={toX(selected)}
                y2={padTop + plotH}
                stroke="#0f172a"
                strokeWidth={1.2}
                strokeDasharray="3 3"
              />
              <circle
                cx={toX(selected)}
                cy={toY(selected)}
                r={5.5}
                fill={selected.exceedsAscentLimit ? '#dc2626' : '#0284c7'}
                stroke="#ffffff"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
      </div>

      {/* Configurable Default Layer Checkboxes (touch-friendly pills) */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-slate-200 text-xs font-medium">
        <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-emerald-700">
          <input
            type="checkbox"
            checked={layers.showTemp}
            onChange={() => toggleLayer('showTemp')}
            className="accent-emerald-600 w-4 h-4"
          />
          <span>{t('layerTemp')}</span>
        </label>

        <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-red-700">
          <input
            type="checkbox"
            checked={layers.showAlerts}
            onChange={() => toggleLayer('showAlerts')}
            className="accent-red-600 w-4 h-4"
          />
          <span>{t('layerAlerts')}</span>
        </label>

        <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-amber-700">
          <input
            type="checkbox"
            checked={layers.showSpeed}
            onChange={() => toggleLayer('showSpeed')}
            className="accent-amber-600 w-4 h-4"
          />
          <span>{t('layerSpeed')}</span>
        </label>

        <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-indigo-700">
          <input
            type="checkbox"
            checked={layers.showPressure}
            onChange={() => toggleLayer('showPressure')}
            className="accent-indigo-600 w-4 h-4"
          />
          <span>{t('layerPressure')}</span>
        </label>

        <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-violet-700">
          <input
            type="checkbox"
            checked={layers.showStops}
            onChange={() => toggleLayer('showStops')}
            className="accent-violet-600 w-4 h-4"
          />
          <span>{t('layerStops')}</span>
        </label>
      </div>
    </div>
  );
});

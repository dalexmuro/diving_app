import { AlertTriangle, X } from 'lucide-react';
import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  findNearestProfilePoint,
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

const SVG_W = 920;
const SVG_H = 330;
const PAD_LEFT = 54;
const PAD_RIGHT = 54;
const PAD_TOP = 18;
const PAD_BOTTOM = 34;
const PLOT_W = SVG_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = SVG_H - PAD_TOP - PAD_BOTTOM;

export function DiveProfileChart({
  samples,
  totalDurationS,
  startPressureBar,
  endPressureBar,
  decoStops = [],
}: DiveProfileChartProps) {
  const { unitSystem, ascentLimitMMin, t } = usePreferences();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selected, setSelected] = useState<PlottedProfilePoint | null>(null);
  const [layers, setLayers] = useState<ChartLayerPrefs>(loadLayerPrefs);

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

  if (profile.points.length === 0) {
    return null;
  }

  const toX = (p: PlottedProfilePoint) => PAD_LEFT + p.xRatio * PLOT_W;
  const toY = (p: PlottedProfilePoint) => PAD_TOP + p.yRatio * PLOT_H;

  // Temperature Y-scale (Right Axis, green, like Suunto DM5)
  const tempPoints = profile.points.filter((p) => p.tempC != null);
  const minTempC = tempPoints.length > 0 ? Math.floor(Math.min(...tempPoints.map((p) => p.tempC!)) - 1) : 10;
  const maxTempC = tempPoints.length > 0 ? Math.ceil(Math.max(...tempPoints.map((p) => p.tempC!)) + 1) : 25;
  const tempSpan = Math.max(2, maxTempC - minTempC);
  const tempToY = (c: number) => PAD_TOP + (1 - (c - minTempC) / tempSpan) * PLOT_H;

  // Pressure Y-scale (optional overlay)
  const pressurePoints = profile.points.filter((p) => p.pressureBar != null);
  const maxPressure = pressurePoints.length > 0 ? Math.max(200, ...pressurePoints.map((p) => p.pressureBar!)) : 200;
  const pressureToY = (bar: number) => PAD_TOP + (1 - bar / maxPressure) * PLOT_H;

  // Ascent speed overlay (0 to max(25, peak) m/min)
  const maxSpeed = Math.max(25, profile.peakAscentRateMMin);
  const speedPoints = profile.points.filter((p) => p.ascentRateMMin != null && p.ascentRateMMin > 0);
  const speedToY = (rate: number) => PAD_TOP + (1 - Math.min(1, rate / maxSpeed)) * PLOT_H;

  const areaPath = [
    `M ${toX(profile.points[0])} ${PAD_TOP}`,
    ...profile.points.map((p) => `L ${toX(p)} ${toY(p)}`),
    `L ${toX(profile.points[profile.points.length - 1])} ${PAD_TOP}`,
    'Z',
  ].join(' ');

  const tempPath =
    tempPoints.length > 1
      ? tempPoints
          .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(p)} ${tempToY(p.tempC!)}`)
          .join(' ')
      : '';

  const pressurePath =
    pressurePoints.length > 1
      ? pressurePoints
          .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(p)} ${pressureToY(p.pressureBar!)}`)
          .join(' ')
      : '';

  const speedPath =
    speedPoints.length > 1
      ? speedPoints
          .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(p)} ${speedToY(p.ascentRateMMin!)}`)
          .join(' ')
      : '';

  function handleChartClick(e: MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = SVG_W / rect.width;
    const svgX = (e.clientX - rect.left) * scaleX;
    const ratio = (svgX - PAD_LEFT) / PLOT_W;
    const nearest = findNearestProfilePoint(profile.points, ratio);
    setSelected(nearest);
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const effectiveTotalDuration = totalDurationS ?? profile.maxElapsedS;

  const toggleLayer = (key: keyof ChartLayerPrefs) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="panel-surface p-5 space-y-4 relative">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{t('diveProfile')}</h2>
      </div>

      <div className="relative select-none">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          onClick={handleChartClick}
          className="w-full h-auto cursor-crosshair overflow-visible"
          role="img"
          aria-label={t('diveProfile')}
        >
          <defs>
            <linearGradient id="diveDepthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.65" />
            </linearGradient>
          </defs>

          {/* Horizontal Depth Gridlines & Left Depth Axis */}
          {yTicks.map((ratio) => {
            const y = PAD_TOP + ratio * PLOT_H;
            const depthVal = convertDepth(ratio * profile.maxDepthM, unitSystem);
            return (
              <g key={`y-${ratio}`}>
                <line
                  x1={PAD_LEFT}
                  y1={y}
                  x2={SVG_W - PAD_RIGHT}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={ratio === 0 ? undefined : '4 4'}
                />
                <text
                  x={PAD_LEFT - 8}
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

          {/* Right Temperature Axis (when Agua/Temp layer is active) */}
          {layers.showTemp &&
            tempPoints.length > 0 &&
            yTicks.map((ratio) => {
              const y = PAD_TOP + ratio * PLOT_H;
              const tempC = maxTempC - ratio * tempSpan;
              const dispTemp = Math.round(convertTemp(tempC, unitSystem));
              return (
                <text
                  key={`t-${ratio}`}
                  x={SVG_W - PAD_RIGHT + 8}
                  y={y + 4}
                  textAnchor="start"
                  className="fill-emerald-700 text-[11px] tabular-telemetry"
                >
                  {dispTemp}°{unitSystem === 'imperial' ? 'F' : 'C'}
                </text>
              );
            })}

          {/* Bottom Time Axis */}
          {xTicks.map((ratio) => {
            const x = PAD_LEFT + ratio * PLOT_W;
            const sec = Math.round(ratio * profile.maxElapsedS);
            return (
              <text
                key={`x-${ratio}`}
                x={x}
                y={SVG_H - 8}
                textAnchor="middle"
                className="fill-slate-600 text-[11px] tabular-telemetry"
              >
                {formatElapsedMmSs(sec)}
              </text>
            );
          })}

          {/* Ocean Depth Gradient Fill */}
          <path d={areaPath} fill="url(#diveDepthFill)" />

          {/* Deco / Safety Stops Reference Lines */}
          {layers.showStops &&
            decoStops.map((stop, idx) => {
              if (stop.depth_m > profile.maxDepthM) return null;
              const y = PAD_TOP + (stop.depth_m / profile.maxDepthM) * PLOT_H;
              return (
                <g key={`stop-${idx}`}>
                  <line
                    x1={PAD_LEFT}
                    y1={y}
                    x2={SVG_W - PAD_RIGHT}
                    y2={y}
                    stroke="#7c3aed"
                    strokeWidth={1.25}
                    strokeDasharray="6 4"
                  />
                  <text
                    x={PAD_LEFT + 6}
                    y={y - 4}
                    className="fill-violet-700 text-[10px] font-medium tabular-telemetry"
                  >
                    {t('layerStops')}: {formatDepth(stop.depth_m, unitSystem)} · {stop.duration_min}m
                  </text>
                </g>
              );
            })}

          {/* Profile Curve Segments */}
          {profile.segments.map((seg) => {
            const isRed = layers.showAlerts && seg.exceedsAscentLimit;
            return (
              <line
                key={seg.to.index}
                x1={toX(seg.from)}
                y1={toY(seg.from)}
                x2={toX(seg.to)}
                y2={toY(seg.to)}
                stroke={isRed ? '#dc2626' : '#0369a1'}
                strokeWidth={isRed ? 3.2 : 2.1}
                strokeLinecap="round"
              />
            );
          })}

          {/* Overlaid Green Water Temperature Curve */}
          {layers.showTemp && tempPath && (
            <path d={tempPath} fill="none" stroke="#059669" strokeWidth={1.8} />
          )}

          {/* Optional Tank Pressure Curve */}
          {layers.showPressure && pressurePath && (
            <path
              d={pressurePath}
              fill="none"
              stroke="#4f46e5"
              strokeWidth={1.6}
              strokeDasharray="5 3"
            />
          )}

          {/* Optional Ascent Speed Overlay */}
          {layers.showSpeed && speedPath && (
            <path
              d={speedPath}
              fill="none"
              stroke="#d97706"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          )}

          {/* Red Violation Dots */}
          {layers.showAlerts &&
            profile.points
              .filter((p) => p.exceedsAscentLimit)
              .map((p) => (
                <circle
                  key={`v-${p.index}`}
                  cx={toX(p)}
                  cy={toY(p)}
                  r={4}
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
                y1={PAD_TOP}
                x2={toX(selected)}
                y2={PAD_TOP + PLOT_H}
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

        {/* Interactive Point Popup */}
        {selected && (
          <div
            role="dialog"
            aria-label={t('diveProfile')}
            className="mt-3 md:mt-0 md:absolute md:top-2 md:right-14 z-10 w-full md:w-80 rounded-xl border border-slate-800 bg-[#0b192c] text-slate-100 p-3.5 shadow-lg space-y-2.5"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="text-xs text-slate-300 space-x-2">
                <span>
                  {t('elapsedTime')}:{' '}
                  <strong className="text-white tabular-telemetry">
                    {formatElapsedMmSs(selected.elapsedS)}
                  </strong>
                </span>
                <span className="text-slate-500">/</span>
                <span className="text-slate-400 tabular-telemetry">
                  {formatDuration(effectiveTotalDuration)}
                </span>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelected(null)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-slate-400">{t('depth')}</dt>
                <dd className="font-semibold text-white tabular-telemetry">
                  {formatDepth(selected.depthM, unitSystem)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">{t('ascentRate')}</dt>
                <dd
                  className={`font-semibold tabular-telemetry ${
                    selected.exceedsAscentLimit ? 'text-red-400' : 'text-white'
                  }`}
                >
                  {formatAscentRate(selected.ascentRateMMin, unitSystem)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">{t('waterTemp')}</dt>
                <dd className="font-semibold text-emerald-300 tabular-telemetry">
                  {formatTemp(selected.tempC, unitSystem)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">{t('tankPressure')}</dt>
                <dd className="font-semibold text-white tabular-telemetry">
                  {formatPressure(selected.pressureBar, unitSystem)}
                </dd>
              </div>
            </dl>

            {selected.exceedsAscentLimit && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/70 px-2.5 py-1.5 text-[11px] font-medium text-red-200">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>
                  {t('ascentAlert')} ({formatAscentRate(ascentLimitMMin, unitSystem)})
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Configurable Default Layer Checkboxes (Suunto DM5 style) */}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-2 border-t border-slate-200 text-xs font-medium">
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-emerald-700">
          <input
            type="checkbox"
            checked={layers.showTemp}
            onChange={() => toggleLayer('showTemp')}
            className="accent-emerald-600"
          />
          <span>{t('layerTemp')}</span>
        </label>

        <label className="inline-flex items-center gap-1.5 cursor-pointer text-red-700">
          <input
            type="checkbox"
            checked={layers.showAlerts}
            onChange={() => toggleLayer('showAlerts')}
            className="accent-red-600"
          />
          <span>{t('layerAlerts')}</span>
        </label>

        <label className="inline-flex items-center gap-1.5 cursor-pointer text-amber-700">
          <input
            type="checkbox"
            checked={layers.showSpeed}
            onChange={() => toggleLayer('showSpeed')}
            className="accent-amber-600"
          />
          <span>{t('layerSpeed')}</span>
        </label>

        <label className="inline-flex items-center gap-1.5 cursor-pointer text-indigo-700">
          <input
            type="checkbox"
            checked={layers.showPressure}
            onChange={() => toggleLayer('showPressure')}
            className="accent-indigo-600"
          />
          <span>{t('layerPressure')}</span>
        </label>

        <label className="inline-flex items-center gap-1.5 cursor-pointer text-violet-700">
          <input
            type="checkbox"
            checked={layers.showStops}
            onChange={() => toggleLayer('showStops')}
            className="accent-violet-600"
          />
          <span>{t('layerStops')}</span>
        </label>
      </div>
    </div>
  );
}

import { AlertTriangle, X } from 'lucide-react';
import { type MouseEvent, useMemo, useRef, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import {
  convertDepth,
  formatAscentRate,
  formatDepth,
  formatElapsedMmSs,
  formatPressure,
  formatTemp,
} from '../services/units';
import { type TelemetrySample } from '../types/domain';
import {
  type PlottedProfilePoint,
  buildProfileGeometry,
  findNearestProfilePoint,
} from './profileGeometry';

interface DiveProfileChartProps {
  samples: TelemetrySample[];
  startPressureBar?: number | null;
  endPressureBar?: number | null;
}

const SVG_W = 880;
const SVG_H = 300;
const PAD_LEFT = 54;
const PAD_RIGHT = 20;
const PAD_TOP = 18;
const PAD_BOTTOM = 34;
const PLOT_W = SVG_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = SVG_H - PAD_TOP - PAD_BOTTOM;

export function DiveProfileChart({
  samples,
  startPressureBar,
  endPressureBar,
}: DiveProfileChartProps) {
  const { unitSystem, ascentLimitMMin, t } = usePreferences();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selected, setSelected] = useState<PlottedProfilePoint | null>(null);

  const profile = useMemo(
    () => buildProfileGeometry(samples, ascentLimitMMin, startPressureBar, endPressureBar),
    [samples, ascentLimitMMin, startPressureBar, endPressureBar],
  );

  if (profile.points.length === 0) {
    return null;
  }

  const toX = (p: PlottedProfilePoint) => PAD_LEFT + p.xRatio * PLOT_W;
  const toY = (p: PlottedProfilePoint) => PAD_TOP + p.yRatio * PLOT_H;

  const areaPath = [
    `M ${toX(profile.points[0])} ${PAD_TOP}`,
    ...profile.points.map((p) => `L ${toX(p)} ${toY(p)}`),
    `L ${toX(profile.points[profile.points.length - 1])} ${PAD_TOP}`,
    'Z',
  ].join(' ');

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
  const xTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="panel-surface p-5 space-y-4 relative">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{t('diveProfile')}</h2>
        {profile.violationCount > 0 && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-800">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span>
              {t('ascentAlert')} ({formatAscentRate(ascentLimitMMin, unitSystem)}) ·{' '}
              <strong className="tabular-telemetry">{profile.violationCount}</strong>
            </span>
          </div>
        )}
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
          {/* Horizontal Depth Gridlines */}
          {yTicks.map((ratio) => {
            const y = PAD_TOP + ratio * PLOT_H;
            const depthVal = convertDepth(ratio * profile.maxDepthM, unitSystem);
            return (
              <g key={ratio}>
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
                  className="fill-slate-500 text-[11px] tabular-telemetry"
                >
                  {depthVal}
                  {unitSystem === 'imperial' ? 'ft' : 'm'}
                </text>
              </g>
            );
          })}

          {/* Time Ticks */}
          {xTicks.map((ratio) => {
            const x = PAD_LEFT + ratio * PLOT_W;
            const sec = Math.round(ratio * profile.maxElapsedS);
            return (
              <text
                key={ratio}
                x={x}
                y={SVG_H - 8}
                textAnchor="middle"
                className="fill-slate-500 text-[11px] tabular-telemetry"
              >
                {formatElapsedMmSs(sec)}
              </text>
            );
          })}

          {/* Subtle Ocean Depth Fill */}
          <path d={areaPath} fill="#0284c7" fillOpacity="0.10" />

          {/* Profile Curve Segments (Ocean Blue normal, Crimson Red when exceeding ascent limit) */}
          {profile.segments.map((seg) => (
            <line
              key={seg.to.index}
              x1={toX(seg.from)}
              y1={toY(seg.from)}
              x2={toX(seg.to)}
              y2={toY(seg.to)}
              stroke={seg.exceedsAscentLimit ? '#dc2626' : '#0284c7'}
              strokeWidth={seg.exceedsAscentLimit ? 3.2 : 2.2}
              strokeLinecap="round"
            />
          ))}

          {/* Red Violation Dots */}
          {profile.points
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
                strokeWidth={1}
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

        {/* Interactive Inspection Popup */}
        {selected && (
          <div
            role="dialog"
            aria-label={t('diveProfile')}
            className="mt-3 md:mt-0 md:absolute md:top-2 md:right-2 z-10 w-full md:w-72 rounded-xl border border-slate-800 bg-[#0b192c] text-slate-100 p-3.5 shadow-lg space-y-2"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-medium text-slate-300">
                {t('elapsedTime')}:{' '}
                <strong className="text-white tabular-telemetry">
                  {formatElapsedMmSs(selected.elapsedS)}
                </strong>
              </span>
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
                <dt className="text-slate-400">{t('tankPressure')}</dt>
                <dd className="font-semibold text-white tabular-telemetry">
                  {formatPressure(selected.pressureBar, unitSystem)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">{t('waterTemp')}</dt>
                <dd className="font-semibold text-white tabular-telemetry">
                  {formatTemp(selected.tempC, unitSystem)}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

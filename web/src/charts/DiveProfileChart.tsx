import { AlertTriangle, ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import {
  type KeyboardEvent,
  type PointerEvent,
  memo,
  useCallback,
  useEffect,
  useId,
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
  const clipId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);
  const activePointersRef = useRef<Map<number, number>>(new Map());
  const pinchStartRef = useRef<{
    dist: number;
    midRatio: number;
    startS: number;
    endS: number;
  } | null>(null);

  const [selected, setSelected] = useState<PlottedProfilePoint | null>(null);
  const [layers, setLayers] = useState<ChartLayerPrefs>(loadLayerPrefs);
  const [containerWidth, setContainerWidth] = useState(920);
  const [zoomWindow, setZoomWindow] = useState<{ startS: number; endS: number } | null>(null);

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

  // Reset zoom whenever the underlying dive samples change
  useEffect(() => {
    setZoomWindow(null);
    setSelected(null);
  }, [samples]);

  // Base full-dive time ceiling (rounded to 5 or 10 min)
  const baseTimeStepMin = isCompact
    ? profile.maxElapsedS <= 25 * 60
      ? 5
      : 10
    : profile.maxElapsedS <= 35 * 60
      ? 5
      : 10;
  const baseTimeStepS = baseTimeStepMin * 60;
  const fullAxisMaxElapsedS = Math.max(
    baseTimeStepS,
    Math.ceil(Math.max(profile.maxElapsedS, 1) / baseTimeStepS) * baseTimeStepS,
  );

  // Active visible time window [viewStartS, viewEndS]
  const viewStartS = zoomWindow ? Math.max(0, Math.min(zoomWindow.startS, fullAxisMaxElapsedS - 60)) : 0;
  const viewEndS = zoomWindow
    ? Math.max(viewStartS + 60, Math.min(zoomWindow.endS, fullAxisMaxElapsedS))
    : fullAxisMaxElapsedS;
  const viewSpanS = Math.max(60, viewEndS - viewStartS);
  const isZoomed = zoomWindow !== null && (viewStartS > 0.5 || viewEndS < fullAxisMaxElapsedS - 0.5);
  const zoomFactor = fullAxisMaxElapsedS / viewSpanS;
  const minWindowS = Math.min(60, fullAxisMaxElapsedS);

  // Auto-adjust time tick interval based on visible zoomed window
  const timeStepS =
    viewSpanS <= 180
      ? 30
      : viewSpanS <= 420
        ? 60
        : viewSpanS <= 1080
          ? 120
          : viewSpanS <= (isCompact ? 1500 : 2100)
            ? 300
            : 600;

  // Auto-adjust depth scale based on visible points when zoomed (fixed 5 m at 1x, 2 m when zoomed shallow)
  const { depthStepM, axisMaxDepthM } = useMemo(() => {
    if (!isZoomed || profile.points.length === 0) {
      const step = 5;
      return {
        depthStepM: step,
        axisMaxDepthM: Math.max(step, Math.ceil(Math.max(profile.maxDepthM, 1) / step) * step),
      };
    }
    let visMax = 0;
    for (const p of profile.points) {
      if (p.elapsedS >= viewStartS && p.elapsedS <= viewEndS && p.depthM > visMax) {
        visMax = p.depthM;
      }
    }
    if (profile.maxElapsedS > 0) {
      const pStart = interpolateProfilePoint(profile.points, viewStartS / profile.maxElapsedS);
      const pEnd = interpolateProfilePoint(profile.points, viewEndS / profile.maxElapsedS);
      if (pStart && pStart.depthM > visMax) visMax = pStart.depthM;
      if (pEnd && pEnd.depthM > visMax) visMax = pEnd.depthM;
    }
    const safeMax = Math.max(visMax, 1);
    const step = safeMax <= 10 ? 2 : 5;
    return {
      depthStepM: step,
      axisMaxDepthM: Math.max(step, Math.ceil(safeMax / step) * step),
    };
  }, [isZoomed, profile.points, profile.maxDepthM, profile.maxElapsedS, viewStartS, viewEndS]);

  const applyZoom = useCallback(
    (factor: number, anchorS?: number) => {
      const curStart = zoomWindow ? zoomWindow.startS : 0;
      const curEnd = zoomWindow ? zoomWindow.endS : fullAxisMaxElapsedS;
      const curSpan = curEnd - curStart;
      const center =
        anchorS != null
          ? Math.max(curStart, Math.min(curEnd, anchorS))
          : (curStart + curEnd) / 2;
      const ratio = curSpan > 0 ? (center - curStart) / curSpan : 0.5;
      const nextSpan = Math.max(minWindowS, Math.min(fullAxisMaxElapsedS, curSpan / factor));
      if (nextSpan >= fullAxisMaxElapsedS - 1) {
        setZoomWindow(null);
        return;
      }
      let nextStart = center - ratio * nextSpan;
      let nextEnd = nextStart + nextSpan;
      if (nextStart < 0) {
        nextStart = 0;
        nextEnd = nextSpan;
      }
      if (nextEnd > fullAxisMaxElapsedS) {
        nextEnd = fullAxisMaxElapsedS;
        nextStart = Math.max(0, fullAxisMaxElapsedS - nextSpan);
      }
      setZoomWindow({ startS: nextStart, endS: nextEnd });
    },
    [zoomWindow, fullAxisMaxElapsedS, minWindowS],
  );

  const panBy = useCallback(
    (direction: -1 | 1) => {
      if (!zoomWindow) return;
      const span = zoomWindow.endS - zoomWindow.startS;
      const delta = span * 0.25 * direction;
      let nextStart = zoomWindow.startS + delta;
      let nextEnd = zoomWindow.endS + delta;
      if (nextStart < 0) {
        nextStart = 0;
        nextEnd = span;
      }
      if (nextEnd > fullAxisMaxElapsedS) {
        nextEnd = fullAxisMaxElapsedS;
        nextStart = Math.max(0, fullAxisMaxElapsedS - span);
      }
      setZoomWindow({ startS: nextStart, endS: nextEnd });
    },
    [zoomWindow, fullAxisMaxElapsedS],
  );

  // Non-passive wheel listener on container so mouse-wheel zooms smoothly without scrolling page
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return;
      const scaleX = svgW / rect.width;
      const svgX = (e.clientX - rect.left) * scaleX;
      const axisRatio = Math.max(0, Math.min(1, (svgX - padLeft) / plotW));
      const anchorS = viewStartS + axisRatio * viewSpanS;
      const factor = e.deltaY < 0 ? 1.35 : 1 / 1.35;
      applyZoom(factor, anchorS);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom, svgW, padLeft, plotW, viewStartS, viewSpanS]);

  // Precompute all SVG paths in useMemo so scrubbing/tapping never rebuilds path strings
  const geometry = useMemo(() => {
    if (profile.points.length === 0) return null;

    const toX = (p: PlottedProfilePoint) => padLeft + ((p.elapsedS - viewStartS) / viewSpanS) * plotW;
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
  }, [profile, padLeft, padTop, plotW, plotH, viewStartS, viewSpanS, axisMaxDepthM]);

  if (!geometry || profile.points.length === 0) {
    return null;
  }

  const toX = (p: PlottedProfilePoint) => padLeft + ((p.elapsedS - viewStartS) / viewSpanS) * plotW;
  const toY = (p: PlottedProfilePoint) => padTop + (p.depthM / axisMaxDepthM) * plotH;

  function clientXToAxisRatio(clientX: number): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const scaleX = svgW / rect.width;
    const svgX = (clientX - rect.left) * scaleX;
    return Math.max(0, Math.min(1, (svgX - padLeft) / plotW));
  }

  function selectAtClientPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const svgX = ((clientX - rect.left) / rect.width) * svgW;
    const svgY = ((clientY - rect.top) / rect.height) * svgH;

    // 1. 2D closest-point-on-segment projection for nearby segments (makes steep/vertical red ascent lines effortless to click & scrub at any height)
    const hitRadiusPx = 28;
    const hitRadiusSq = hitRadiusPx * hitRadiusPx;
    let bestDistSq = hitRadiusSq;
    let bestPoint: PlottedProfilePoint | null = null;

    for (const seg of profile.segments) {
      const ax = toX(seg.from);
      const bx = toX(seg.to);
      // Skip segments outside horizontal search band
      if (Math.max(ax, bx) < svgX - hitRadiusPx || Math.min(ax, bx) > svgX + hitRadiusPx) {
        continue;
      }
      const ay = toY(seg.from);
      const by = toY(seg.to);
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      const t =
        lenSq > 0
          ? Math.max(0, Math.min(1, ((svgX - ax) * dx + (svgY - ay) * dy) / lenSq))
          : 0;
      const px = ax + t * dx;
      const py = ay + t * dy;
      const distSq = (svgX - px) * (svgX - px) + (svgY - py) * (svgY - py);

      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        const lerp = (a: number, b: number) => a + (b - a) * t;
        const lerpNullable = (a: number | null, b: number | null) =>
          a != null && b != null ? Math.round(lerp(a, b) * 10) / 10 : (b ?? a);
        bestPoint = {
          index: seg.to.index,
          elapsedS: Math.round(lerp(seg.from.elapsedS, seg.to.elapsedS)),
          depthM: Math.round(lerp(seg.from.depthM, seg.to.depthM) * 100) / 100,
          tempC: lerpNullable(seg.from.tempC, seg.to.tempC),
          pressureBar: lerpNullable(seg.from.pressureBar, seg.to.pressureBar),
          ascentRateMMin: seg.to.ascentRateMMin,
          exceedsAscentLimit: seg.exceedsAscentLimit,
          xRatio: lerp(seg.from.xRatio, seg.to.xRatio),
          yRatio: lerp(seg.from.yRatio, seg.to.yRatio),
        };
      }
    }

    if (bestPoint) {
      setSelected(bestPoint);
      return;
    }

    // 2. Fallback to horizontal X interpolation when clicking in open chart space above/below the curve
    const axisRatio = Math.max(0, Math.min(1, (svgX - padLeft) / plotW));
    const targetElapsedS = viewStartS + axisRatio * viewSpanS;
    const pointRatio = profile.maxElapsedS > 0 ? targetElapsedS / profile.maxElapsedS : 0;
    setSelected(interpolateProfilePoint(profile.points, pointRatio));
  }

  function handlePointerDown(e: PointerEvent<SVGSVGElement>) {
    activePointersRef.current.set(e.pointerId, e.clientX);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors on synthetic events
    }

    if (activePointersRef.current.size === 2) {
      draggingRef.current = false;
      const xs = [...activePointersRef.current.values()];
      const dist = Math.max(10, Math.abs(xs[1] - xs[0]));
      const midRatio = clientXToAxisRatio((xs[0] + xs[1]) / 2) ?? 0.5;
      pinchStartRef.current = {
        dist,
        midRatio,
        startS: viewStartS,
        endS: viewEndS,
      };
      return;
    }

    draggingRef.current = true;
    selectAtClientPoint(e.clientX, e.clientY);
  }

  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, e.clientX);
    }

    if (activePointersRef.current.size === 2 && pinchStartRef.current) {
      const xs = [...activePointersRef.current.values()];
      const curDist = Math.max(10, Math.abs(xs[1] - xs[0]));
      const scale = curDist / pinchStartRef.current.dist;
      const baseSpan = pinchStartRef.current.endS - pinchStartRef.current.startS;
      const nextSpan = Math.max(minWindowS, Math.min(fullAxisMaxElapsedS, baseSpan / scale));
      if (nextSpan >= fullAxisMaxElapsedS - 1) {
        setZoomWindow(null);
        return;
      }
      const anchorS =
        pinchStartRef.current.startS + pinchStartRef.current.midRatio * baseSpan;
      let nextStart = anchorS - pinchStartRef.current.midRatio * nextSpan;
      let nextEnd = nextStart + nextSpan;
      if (nextStart < 0) {
        nextStart = 0;
        nextEnd = nextSpan;
      }
      if (nextEnd > fullAxisMaxElapsedS) {
        nextEnd = fullAxisMaxElapsedS;
        nextStart = Math.max(0, fullAxisMaxElapsedS - nextSpan);
      }
      setZoomWindow({ startS: nextStart, endS: nextEnd });
      return;
    }

    if (!draggingRef.current) return;
    selectAtClientPoint(e.clientX, e.clientY);
  }

  function handlePointerUp(e: PointerEvent<SVGSVGElement>) {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchStartRef.current = null;
    }
    if (activePointersRef.current.size === 0) {
      draggingRef.current = false;
    }
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
  const firstTickS = Math.ceil(viewStartS / timeStepS) * timeStepS;
  for (let s = firstTickS; s <= viewEndS + 0.01; s += timeStepS) {
    xTimeTicksS.push(Math.round(s));
  }
  const tempTicks = [0, 0.25, 0.5, 0.75, 1];
  const effectiveTotalDuration = totalDurationS ?? profile.maxElapsedS;

  const toggleLayer = (key: keyof ChartLayerPrefs) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="panel-surface p-4 sm:p-5 space-y-3.5 relative">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">{t('diveProfile')}</h2>
          {isZoomed && (
            <span className="rounded-full bg-sky-100 border border-sky-200 px-2 py-0.5 text-[11px] font-semibold text-sky-800 tabular-telemetry">
              {zoomFactor.toFixed(1)}×
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isZoomed && (
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                aria-label={t('panLeft')}
                title={t('panLeft')}
                disabled={viewStartS <= 0.5}
                onClick={() => panBy(-1)}
                className="p-1.5 rounded-md text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label={t('panRight')}
                title={t('panRight')}
                disabled={viewEndS >= fullAxisMaxElapsedS - 0.5}
                onClick={() => panBy(1)}
                className="p-1.5 rounded-md text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              aria-label={t('zoomOut')}
              title={t('zoomOut')}
              disabled={!isZoomed}
              onClick={() => applyZoom(1 / 1.6, selected?.elapsedS)}
              className="p-1.5 rounded-md text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label={t('zoomIn')}
              title={t('zoomIn')}
              disabled={viewSpanS <= minWindowS + 1}
              onClick={() => applyZoom(1.6, selected?.elapsedS)}
              className="p-1.5 rounded-md text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {isZoomed && (
              <button
                type="button"
                aria-label={t('resetZoom')}
                title={t('resetZoom')}
                onClick={() => setZoomWindow(null)}
                className="p-1.5 rounded-md text-sky-700 hover:bg-white hover:text-sky-900 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

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
          onDoubleClick={(e) => {
            const ratio = clientXToAxisRatio(e.clientX);
            if (ratio == null) return;
            const anchorS = viewStartS + ratio * viewSpanS;
            if (viewSpanS <= minWindowS + 5) {
              setZoomWindow(null);
            } else {
              applyZoom(2, anchorS);
            }
          }}
          style={{ touchAction: isZoomed ? 'none' : 'pan-y' }}
          className="w-full h-auto max-h-[55dvh] cursor-crosshair overflow-visible"
          role="img"
          aria-label={t('diveProfile')}
        >
          <defs>
            <linearGradient id="diveDepthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.65" />
            </linearGradient>
            <clipPath id={clipId}>
              <rect x={padLeft} y={padTop} width={plotW} height={plotH} />
            </clipPath>
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

          {/* Vertical Time Gridlines & Bottom Time Axis (auto-adjusted to zoomed window) */}
          {xTimeTicksS.map((sec) => {
            const x = padLeft + ((sec - viewStartS) / viewSpanS) * plotW;
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

          {/* Clipped Plot Area so zoomed curves never overflow axes */}
          <g clipPath={`url(#${clipId})`}>
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
          </g>
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

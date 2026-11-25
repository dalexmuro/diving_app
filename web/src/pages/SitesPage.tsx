import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowDown, ChevronDown, ChevronRight, Clock, Globe, MapPin } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';
import { formatDepth, formatDuration } from '../services/units';
import { type DiveSite, type DiveSummary } from '../types/domain';

interface SitesPageProps {
  isOffline: boolean;
  dives: DiveSummary[];
  onSelectDive: (diveId: string) => void;
}

export function SitesPage({ isOffline, dives, onSelectDive }: SitesPageProps) {
  const { language, unitSystem, t } = usePreferences();
  const [sites, setSites] = useState<DiveSite[]>([]);
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const siteMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const hasFitBoundsRef = useRef(false);
  const siteRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  function createSiteDotIcon() {
    return L.divIcon({
      className: '',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -8],
      html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:#0284c7;border:2px solid #0b192c;box-shadow:0 1px 3px rgba(15,23,42,0.35);"></span>`,
    });
  }

  useEffect(() => {
    void apiClient.fetchSites().then((res) => setSites(res.data));
  }, []);

  // Initialize OpenStreetMap Leaflet map when online (view-only)
  useEffect(() => {
    if (isOffline || !mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView([43.0, 6.2], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    markersLayerRef.current = layerGroup;

    // Recalculate Leaflet tile bounds cleanly on Android orientation/foldable resize
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(mapContainerRef.current);
    }

    return () => {
      ro?.disconnect();
      hasFitBoundsRef.current = false;
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, [isOffline]);

  function focusSiteInList(siteId: string) {
    setExpandedSiteId(siteId);
    window.requestAnimationFrame(() => {
      const row = siteRowRefs.current.get(siteId);
      row?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function resetMapBounds() {
    const map = mapRef.current;
    if (!map) return;
    const withCoords = sites.filter((s) => s.latitude != null && s.longitude != null);
    if (withCoords.length === 0) return;
    const bounds = L.latLngBounds(withCoords.map((s) => [s.latitude!, s.longitude!]));
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 10, animate: true });
  }

  // Render crisp DOM markers for sites with GPS coordinates
  useEffect(() => {
    const group = markersLayerRef.current;
    const map = mapRef.current;
    if (!group || !map) return;

    group.clearLayers();
    siteMarkersRef.current.clear();
    const withCoords = sites.filter((s) => s.latitude != null && s.longitude != null);
    for (const s of withCoords) {
      const popupBtn = document.createElement('button');
      popupBtn.type = 'button';
      popupBtn.className = 'text-left block w-full cursor-pointer space-y-0.5';

      const titleEl = document.createElement('div');
      titleEl.className = 'font-semibold text-slate-900 text-xs leading-snug';
      titleEl.textContent = s.name;
      popupBtn.appendChild(titleEl);

      const countEl = document.createElement('div');
      countEl.className = 'text-[11px] text-slate-600';
      countEl.textContent = `${t('sitePopupDives')}: ${s.dive_count ?? 0}`;
      popupBtn.appendChild(countEl);

      const ctaEl = document.createElement('div');
      ctaEl.className = 'text-[11px] font-medium text-sky-600 pt-0.5';
      ctaEl.textContent = t('sitePopupViewDives');
      popupBtn.appendChild(ctaEl);

      popupBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        focusSiteInList(s.id);
      });

      const marker = L.marker([s.latitude!, s.longitude!], {
        icon: createSiteDotIcon(),
      })
        .bindPopup(popupBtn)
        .on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          const currentZoom = map.getZoom();
          const targetZoom = currentZoom < 10 ? Math.min(currentZoom + 2, 10) : currentZoom;
          map.setView([s.latitude!, s.longitude!], targetZoom, { animate: true, duration: 0.45 });
        })
        .addTo(group);

      siteMarkersRef.current.set(s.id, marker);
    }
    if (withCoords.length > 0 && !hasFitBoundsRef.current) {
      const bounds = L.latLngBounds(withCoords.map((s) => [s.latitude!, s.longitude!]));
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
      hasFitBoundsRef.current = true;
    }
  }, [sites, language, t]);

  const divesBySiteId = useMemo(() => {
    const grouped = new Map<string, DiveSummary[]>();
    for (const dive of dives) {
      if (!dive.site_id) continue;
      const list = grouped.get(dive.site_id);
      if (list) {
        list.push(dive);
      } else {
        grouped.set(dive.site_id, [dive]);
      }
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => b.started_at.localeCompare(a.started_at));
    }
    return grouped;
  }, [dives]);

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [language],
  );

  function toggleSiteDives(site: DiveSite) {
    setExpandedSiteId((prev) => {
      const next = prev === site.id ? null : site.id;
      if (next && !isOffline && site.latitude != null && site.longitude != null) {
        const map = mapRef.current;
        if (map) {
          const currentZoom = map.getZoom();
          const targetZoom = currentZoom < 9 ? Math.min(currentZoom + 3, 9) : currentZoom;
          map.setView([site.latitude, site.longitude], targetZoom, {
            animate: true,
            duration: 0.45,
          });
          siteMarkersRef.current.get(site.id)?.openPopup();
        }
      }
      return next;
    });
  }

  return (
    <section
      className={
        isOffline
          ? 'space-y-4'
          : 'flex flex-col gap-3 sm:gap-4 h-[calc(100dvh-9.25rem-var(--safe-top)-var(--safe-bottom))] sm:h-[calc(100dvh-6.75rem)] lg:h-[calc(100dvh-7.75rem)] overflow-hidden'
      }
    >
      <div className="flex items-baseline justify-between gap-2 shrink-0">
        <h1 className="text-[clamp(1.25rem,2.3vw,1.5rem)] font-semibold tracking-tight text-slate-900">
          {t('navSites')}
        </h1>
        <span className="text-xs sm:text-sm font-medium text-slate-500 tabular-telemetry">
          {sites.length}
        </span>
      </div>

      {/* Fixed Interactive Map (view-only, online) */}
      {!isOffline && (
        <div className="panel-surface p-2.5 sm:p-3 shrink-0">
          <div className="relative">
            <div
              ref={mapContainerRef}
              className="w-full h-[clamp(190px,36dvh,360px)] rounded-lg overflow-hidden z-0"
            />
            {sites.some((s) => s.latitude != null && s.longitude != null) && (
              <button
                type="button"
                onClick={resetMapBounds}
                title={t('resetMapView')}
                aria-label={t('resetMapView')}
                className="absolute top-2.5 right-2.5 z-[400] inline-flex items-center gap-1.5 rounded-lg bg-white/95 hover:bg-white border border-slate-300 shadow-sm px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-sky-600" />
                <span className="hidden sm:inline">{t('resetMapView')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scrollable Airy Site Cards (Always available online & offline) */}
      <div className={`flex flex-col gap-2.5 ${isOffline ? '' : 'flex-1 min-h-0'}`}>
        <div className="flex items-center justify-between px-1 shrink-0">
          <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('siteRanking')}
          </h2>
        </div>

        <div
          className={`space-y-3 sm:space-y-3.5 pb-1 ${
            isOffline ? '' : 'flex-1 min-h-0 overflow-y-auto pr-0.5'
          }`}
        >
          {sites.length === 0 ? (
            <div className="panel-surface p-8 text-center text-sm text-slate-600">
              {t('noDivesYet')}
            </div>
          ) : (
            sites.map((site) => {
              const isExpanded = expandedSiteId === site.id;
              const siteDives = divesBySiteId.get(site.id) ?? [];
              const diveCount = site.dive_count ?? siteDives.length;

              return (
                <div
                  key={site.id}
                  ref={(el) => {
                    if (el) {
                      siteRowRefs.current.set(site.id, el);
                    } else {
                      siteRowRefs.current.delete(site.id);
                    }
                  }}
                  className={`rounded-2xl border bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all overflow-hidden ${
                    isExpanded
                      ? 'border-sky-300 ring-1 ring-sky-200/70 shadow-sm'
                      : 'border-slate-200/90 hover:border-sky-300/80 hover:shadow-md'
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleSiteDives(site)}
                    className={`w-full text-left px-4 py-4 sm:px-6 sm:py-4.5 transition-colors flex items-center justify-between gap-3 sm:gap-4 cursor-pointer ${
                      isExpanded ? 'bg-sky-50/40' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-3.5">
                      <div className="hidden sm:flex w-10 h-10 rounded-full bg-[#0b192c] text-white items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-sky-300" />
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <p className="text-base sm:text-[17px] font-semibold text-slate-900 leading-snug truncate">
                          {site.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-telemetry">
                          {site.country && (
                            <span className="inline-flex items-center rounded-md bg-sky-100/85 px-2 py-0.5 font-medium text-sky-950">
                              {site.country}
                            </span>
                          )}
                          <span className="font-medium text-slate-800">
                            {diveCount}{' '}
                            {diveCount === 1 ? t('diveCountSingular') : t('diveCountPlural')}
                          </span>
                          {site.max_depth_m != null && (
                            <span className="text-slate-500">
                              · {formatDepth(site.max_depth_m, unitSystem)}
                            </span>
                          )}
                          {site.latitude != null && site.longitude != null && (
                            <span className="hidden md:inline text-slate-400">
                              · {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <span
                      aria-hidden="true"
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                        isExpanded
                          ? 'bg-sky-600 text-white'
                          : 'bg-teal-400/90 text-slate-900'
                      }`}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="bg-slate-50/80 border-t border-slate-200/80 px-4 py-3.5 sm:px-6">
                      {siteDives.length === 0 ? (
                        <p className="text-xs text-slate-500 py-1">{t('noDivesAtSite')}</p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {t('divesAtSiteLabel')} ({siteDives.length})
                          </p>
                          <ul className="space-y-2">
                            {siteDives.map((dive) => {
                              const formattedDate = Number.isNaN(Date.parse(dive.started_at))
                                ? dive.started_at
                                : dateTimeFormatter.format(new Date(dive.started_at));
                              return (
                                <li key={dive.id}>
                                  <button
                                    type="button"
                                    onClick={() => onSelectDive(dive.id)}
                                    className="w-full text-left rounded-xl border border-slate-200/90 bg-white hover:border-sky-300 hover:bg-sky-50/40 active:bg-sky-100/50 px-4 py-3 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                                  >
                                    <div className="min-w-0 flex items-center gap-2.5">
                                      {dive.log_number != null && (
                                        <span className="shrink-0 inline-flex items-center justify-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 tabular-telemetry">
                                          N° {dive.log_number}
                                        </span>
                                      )}
                                      <span className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                                        {formattedDate}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3.5 shrink-0 text-xs sm:text-sm text-slate-600 tabular-telemetry">
                                      <span className="inline-flex items-center gap-1 font-semibold text-sky-700">
                                        <ArrowDown className="w-3.5 h-3.5 shrink-0" />
                                        {formatDepth(dive.max_depth_m, unitSystem)}
                                      </span>
                                      <span className="inline-flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        {formatDuration(dive.duration_s)}
                                      </span>
                                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                                    </div>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

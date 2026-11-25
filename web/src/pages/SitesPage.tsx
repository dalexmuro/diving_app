import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Clock,
  Globe,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { type GeocodingResult, apiClient } from '../services/api';
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
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  // Google Maps-style location search above the map
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const searchAbortRef = useRef<AbortController | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const siteMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const draftMarkerRef = useRef<L.Marker | null>(null);
  const hasFitBoundsRef = useRef(false);
  const siteRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  // Debounced live search suggestions as user types (Google Maps style)
  useEffect(() => {
    if (isOffline) return;
    const q = searchQuery.trim();
    if (q.length < 3) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void handleMapSearch(q);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [searchQuery, isOffline]);

  function createSiteDotIcon() {
    return L.divIcon({
      className: '',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -8],
      html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:#0284c7;border:2px solid #0b192c;box-shadow:0 1px 3px rgba(15,23,42,0.35);"></span>`,
    });
  }

  function createPinIcon() {
    return L.divIcon({
      className: '',
      iconSize: [28, 36],
      iconAnchor: [14, 35],
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36" style="filter:drop-shadow(0 2px 4px rgba(15,23,42,0.45));">
        <path d="M14 1C6.82 1 1 6.82 1 14c0 9.5 13 21 13 21s13-11.5 13-21C27 6.82 21.18 1 14 1z" fill="#ea580c" stroke="#ffffff" stroke-width="2"/>
        <circle cx="14" cy="14" r="4.5" fill="#ffffff"/>
      </svg>`,
    });
  }

  function updateDraftPin(latitude: number, longitude: number, fly = false) {
    const map = mapRef.current;
    if (!map) return;
    if (draftMarkerRef.current) {
      draftMarkerRef.current.setLatLng([latitude, longitude]);
    } else {
      const marker = L.marker([latitude, longitude], {
        icon: createPinIcon(),
        draggable: true,
      }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        setLat(pos.lat.toFixed(5));
        setLng(pos.lng.toFixed(5));
      });
      draftMarkerRef.current = marker;
    }
    if (fly) {
      map.flyTo([latitude, longitude], 13, { duration: 0.7 });
    }
  }

  async function handleMapSearch(overrideQuery?: string) {
    const q = (overrideQuery ?? searchQuery).trim();
    if (isOffline || !q) return;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    try {
      const found = await apiClient.searchLocation(q, controller.signal);
      if (!controller.signal.aborted) {
        setSearchResults(found);
      }
    } catch {
      // Ignore aborted requests
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  }

  function handleSelectSearchResult(r: GeocodingResult) {
    setShowForm(true);
    setLat(String(r.latitude));
    setLng(String(r.longitude));
    const parts = r.displayName
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name.trim() && parts[0]) setName(parts[0]);
    if (!country.trim() && parts.length > 1) setCountry(parts[parts.length - 1]);
    updateDraftPin(r.latitude, r.longitude, true);
    setSearchResults([]);
  }

  async function reloadSites() {
    const res = await apiClient.fetchSites();
    setSites(res.data);
  }

  useEffect(() => {
    void reloadSites();
  }, []);

  // Initialize OpenStreetMap Leaflet map when online
  useEffect(() => {
    if (isOffline || !mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView([43.0, 6.2], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    map.on('click', (ev: L.LeafletMouseEvent) => {
      const nextLat = Number(ev.latlng.lat.toFixed(5));
      const nextLng = Number(ev.latlng.lng.toFixed(5));
      setShowForm(true);
      setLat(String(nextLat));
      setLng(String(nextLng));
      updateDraftPin(nextLat, nextLng, false);
    });

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
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
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
    map.flyToBounds(bounds, { padding: [32, 32], maxZoom: 12, duration: 0.6 });
  }

  // Render crisp circle markers for sites with GPS coordinates
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

  function selectForEdit(site: DiveSite) {
    setSelectedSiteId(site.id);
    setShowForm(true);
    setName(site.name);
    setCountry(site.country ?? '');
    setLat(site.latitude != null ? String(site.latitude) : '');
    setLng(site.longitude != null ? String(site.longitude) : '');
    if (site.latitude != null && site.longitude != null) {
      updateDraftPin(site.latitude, site.longitude, true);
    }
  }

  function resetForm() {
    setSelectedSiteId(null);
    setShowForm(false);
    setName('');
    setCountry('');
    setLat('');
    setLng('');
    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;
  }

  async function handleSaveSite(e: FormEvent) {
    e.preventDefault();
    if (isOffline || !name.trim()) return;
    await apiClient.saveSite({
      id: selectedSiteId ?? undefined,
      name: name.trim(),
      country: country.trim() || null,
      latitude: lat ? Number(lat) : null,
      longitude: lng ? Number(lng) : null,
    });
    resetForm();
    await reloadSites();
  }

  async function handleDeleteSite(id: string) {
    if (isOffline) return;
    setConfirmDeleteId(null);
    await apiClient.deleteSite(id);
    if (selectedSiteId === id) {
      resetForm();
    }
    await reloadSites();
  }

  return (
    <section
      className={
        isOffline
          ? 'space-y-4'
          : 'flex flex-col gap-3 sm:gap-4 h-[calc(100dvh-9.25rem-var(--safe-top)-var(--safe-bottom))] sm:h-[calc(100dvh-6.75rem)] lg:h-[calc(100dvh-7.75rem)] overflow-hidden'
      }
    >
      <div className="flex items-center justify-between gap-2 shrink-0">
        <h1 className="text-[clamp(1.25rem,2.3vw,1.5rem)] font-semibold tracking-tight text-slate-900">
          {t('navSites')}
        </h1>
        {!isOffline &&
          (showForm || selectedSiteId ? (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              {selectedSiteId ? `${t('editingLabel')} · ${t('cancel')}` : t('cancel')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium px-3 py-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('addSite')}
            </button>
          ))}
      </div>

      {/* Fixed Interactive Map (online) with automatic fallback when offline */}
      {!isOffline && (
        <div className="panel-surface p-3 sm:p-4 space-y-2.5 shrink-0">
          {/* Google Maps-style place search bar */}
          <div className="relative space-y-1.5">
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleMapSearch();
                    } else if (e.key === 'Escape') {
                      setSearchResults([]);
                    }
                  }}
                  placeholder={t('searchLocationPlaceholder')}
                  className="w-full pl-9 pr-8 py-1.5 sm:py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label={t('cancel')}
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                disabled={searching}
                onClick={() => void handleMapSearch()}
                className="rounded-lg bg-[#0b192c] hover:bg-slate-800 active:bg-slate-900 disabled:opacity-50 text-white text-xs font-medium px-3.5 py-1.5 sm:py-2 cursor-pointer shrink-0"
              >
                {searching ? '...' : t('searchLocationBtn')}
              </button>
            </div>

            {searchResults.length > 0 && (
              <ul
                role="listbox"
                className="absolute left-0 right-0 z-30 rounded-xl border border-slate-200 bg-white shadow-lg divide-y divide-slate-100 max-h-52 overflow-y-auto"
              >
                {searchResults.map((r) => (
                  <li key={`${r.latitude},${r.longitude}`} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onClick={() => handleSelectSearchResult(r)}
                      className="w-full text-left px-3 py-2.5 text-xs text-slate-800 hover:bg-sky-50 active:bg-sky-100 flex items-start gap-2 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                      <span className="leading-snug">{r.displayName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="relative">
            <div
              ref={mapContainerRef}
              className="w-full h-[clamp(180px,34dvh,340px)] rounded-lg overflow-hidden z-0"
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

          {(showForm || selectedSiteId) && (
            <form
              ref={formRef}
              onSubmit={(e) => void handleSaveSite(e)}
              className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1"
            >
              <input
                type="text"
                required
                placeholder={t('siteName')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-2 sm:col-span-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <input
                type="text"
                placeholder={t('country')}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="col-span-2 sm:col-span-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-900"
              />
              <input
                type="number"
                step="any"
                placeholder="Lat"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
              <input
                type="number"
                step="any"
                placeholder="Lng"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
              />
              <button
                type="submit"
                className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-3 py-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {selectedSiteId ? t('saveChanges') : t('addSite')}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Scrollable Site Ranking (Always available online & offline) */}
      <div
        className={`panel-surface overflow-hidden flex flex-col ${
          isOffline ? '' : 'flex-1 min-h-0'
        }`}
      >
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 shrink-0 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{t('siteRanking')}</h2>
          <span className="text-xs font-medium text-slate-500 tabular-telemetry">
            {sites.length}
          </span>
        </div>
        <div className={`divide-y divide-slate-200 ${isOffline ? '' : 'flex-1 min-h-0 overflow-y-auto'}`}>
          {sites.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-600">{t('noDivesYet')}</div>
          ) : (
            sites.map((site) => {
              const isExpanded = expandedSiteId === site.id;
              const siteDives = divesBySiteId.get(site.id) ?? [];

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
                >
                  <div
                    className={`px-4 py-3 transition-colors flex items-center justify-between gap-3 ${
                      isExpanded ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleSiteDives(site)}
                    className="flex-1 min-w-0 text-left flex items-center gap-2.5 cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-sky-600 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {site.name}
                        {site.country ? ` · ${site.country}` : ''}
                      </p>
                      <p className="text-xs text-slate-500 inline-flex items-center gap-1 tabular-telemetry">
                        <MapPin className="w-3 h-3 text-sky-600 shrink-0" />
                        {site.latitude != null && site.longitude != null
                          ? `${site.latitude.toFixed(4)}, ${site.longitude.toFixed(4)}`
                          : 'GPS —'}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleSiteDives(site)}
                      className="text-right cursor-pointer"
                    >
                      <p className="text-sm font-semibold text-slate-900 tabular-telemetry">
                        {site.dive_count ?? siteDives.length}
                      </p>
                      <p className="text-xs text-slate-500 tabular-telemetry">
                        {formatDepth(site.max_depth_m ?? null, unitSystem)}
                      </p>
                    </button>

                    {!isOffline &&
                      (confirmDeleteId === site.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            {t('cancel')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSite(site.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-medium text-white cursor-pointer"
                          >
                            {t('delete')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={t('edit')}
                            onClick={() => selectForEdit(site)}
                            className="touch-target flex items-center justify-center rounded-lg text-slate-500 hover:text-sky-700 hover:bg-sky-50 active:bg-sky-100 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={t('delete')}
                            onClick={() => setConfirmDeleteId(site.id)}
                            className="touch-target flex items-center justify-center rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 active:bg-red-100 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-slate-50/80 border-t border-slate-200/80 px-4 py-2.5">
                    {siteDives.length === 0 ? (
                      <p className="text-xs text-slate-500 py-1.5 pl-6">{t('noDivesAtSite')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 pl-6">
                          {t('divesAtSiteLabel')} ({siteDives.length})
                        </p>
                        <ul className="space-y-1">
                          {siteDives.map((dive) => {
                            const formattedDate = Number.isNaN(Date.parse(dive.started_at))
                              ? dive.started_at
                              : dateTimeFormatter.format(new Date(dive.started_at));
                            return (
                              <li key={dive.id}>
                                <button
                                  type="button"
                                  onClick={() => onSelectDive(dive.id)}
                                  className="w-full text-left rounded-lg border border-slate-200/90 bg-white hover:border-sky-300 hover:bg-sky-50/50 active:bg-sky-100/60 px-3 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                                >
                                  <div className="min-w-0 flex items-center gap-2.5">
                                    {dive.log_number != null && (
                                      <span className="shrink-0 inline-flex items-center justify-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 tabular-telemetry">
                                        #{dive.log_number}
                                      </span>
                                    )}
                                    <span className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                                      {formattedDate}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0 text-xs text-slate-600 tabular-telemetry">
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

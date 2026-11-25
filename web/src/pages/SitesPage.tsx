import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Plus, Search, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { type GeocodingResult, apiClient } from '../services/api';
import { formatDepth } from '../services/units';
import { type DiveSite } from '../types/domain';

interface SitesPageProps {
  isOffline: boolean;
}

export function SitesPage({ isOffline }: SitesPageProps) {
  const { unitSystem, t } = usePreferences();
  const [sites, setSites] = useState<DiveSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
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
  const draftMarkerRef = useRef<L.Marker | null>(null);

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
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, [isOffline]);

  // Render crisp circle markers for sites with GPS coordinates
  useEffect(() => {
    const group = markersLayerRef.current;
    const map = mapRef.current;
    if (!group || !map) return;

    group.clearLayers();
    const withCoords = sites.filter((s) => s.latitude != null && s.longitude != null);
    for (const s of withCoords) {
      L.circleMarker([s.latitude!, s.longitude!], {
        radius: 7,
        color: '#0b192c',
        weight: 2,
        fillColor: '#0284c7',
        fillOpacity: 0.9,
      })
        .bindPopup(`<strong>${s.name}</strong><br/>Dives: ${s.dive_count ?? 0}`)
        .addTo(group);
    }
    if (withCoords.length > 0) {
      const bounds = L.latLngBounds(withCoords.map((s) => [s.latitude!, s.longitude!]));
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
    }
  }, [sites]);

  function selectForEdit(site: DiveSite) {
    setSelectedSiteId(site.id);
    setName(site.name);
    setCountry(site.country ?? '');
    setLat(site.latitude != null ? String(site.latitude) : '');
    setLng(site.longitude != null ? String(site.longitude) : '');
    if (site.latitude != null && site.longitude != null) {
      updateDraftPin(site.latitude, site.longitude, true);
    }
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function resetForm() {
    setSelectedSiteId(null);
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

  return (
    <section className="space-y-6">
      <h1 className="text-[clamp(1.35rem,2.5vw,1.6rem)] font-semibold tracking-tight text-slate-900">
        {t('navSites')}
      </h1>

      {/* Interactive Map (online) with automatic fallback when offline */}
      {!isOffline && (
        <div className="panel-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">{t('siteMap')}</h2>
            {selectedSiteId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                {t('editingLabel')} · {t('cancel')}
              </button>
            )}
          </div>
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
                  className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
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
                className="rounded-lg bg-[#0b192c] hover:bg-slate-800 active:bg-slate-900 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 cursor-pointer shrink-0"
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

          <div
            ref={mapContainerRef}
            className="w-full h-[clamp(220px,42dvh,420px)] rounded-lg overflow-hidden z-0"
          />

          <form
            ref={formRef}
            onSubmit={(e) => void handleSaveSite(e)}
            className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pt-2"
          >
            <input
              type="text"
              required
              placeholder={t('siteName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
            />
            <input
              type="text"
              placeholder={t('country')}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900"
            />
            <input
              type="number"
              step="any"
              placeholder="Lat"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
            />
            <input
              type="number"
              step="any"
              placeholder="Lng"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry text-slate-900"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-3 py-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {selectedSiteId ? t('saveChanges') : t('addSite')}
            </button>
          </form>
        </div>
      )}

      {/* Site Ranking (Always available online & offline) */}
      <div className="panel-surface divide-y divide-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-900">{t('siteRanking')}</h2>
        </div>
        {sites.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-600">{t('noDivesYet')}</div>
        ) : (
          sites.map((site) => (
            <button
              key={site.id}
              type="button"
              onClick={() => selectForEdit(site)}
              className="w-full text-left px-4 py-3.5 hover:bg-slate-50 flex items-center justify-between gap-4 cursor-pointer"
            >
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {site.name}
                  {site.country ? ` · ${site.country}` : ''}
                </p>
                <p className="text-xs text-slate-500 inline-flex items-center gap-1 tabular-telemetry">
                  <MapPin className="w-3 h-3 text-sky-600" />
                  {site.latitude != null && site.longitude != null
                    ? `${site.latitude.toFixed(4)}, ${site.longitude.toFixed(4)}`
                    : 'GPS —'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-slate-900 tabular-telemetry">
                  {site.dive_count ?? 0}
                </p>
                <p className="text-xs text-slate-500 tabular-telemetry">
                  {formatDepth(site.max_depth_m ?? null, unitSystem)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Plus } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { apiClient } from '../services/api';
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

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

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
      setLat(ev.latlng.lat.toFixed(5));
      setLng(ev.latlng.lng.toFixed(5));
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
  }

  function resetForm() {
    setSelectedSiteId(null);
    setName('');
    setCountry('');
    setLat('');
    setLng('');
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
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('navSites')}</h1>

      {/* Interactive Map (online) with automatic fallback when offline */}
      {!isOffline && (
        <div className="panel-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">{t('siteMap')}</h2>
          </div>
          <div
            ref={mapContainerRef}
            className="w-full h-[clamp(220px,42dvh,420px)] rounded-lg overflow-hidden z-0"
          />

          <form
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

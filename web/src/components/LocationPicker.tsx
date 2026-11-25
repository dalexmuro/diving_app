import { MapPin, Search } from 'lucide-react';
import { useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';
import { type GeocodingResult, apiClient } from '../services/api';

interface LocationPickerProps {
  label: string;
  locationText?: string;
  latitude: string;
  longitude: string;
  isOffline: boolean;
  showLocationText?: boolean;
  layout?: 'stacked' | 'horizontal';
  onChange: (patch: { locationText?: string; latitude?: string; longitude?: string }) => void;
}

export function LocationPicker({
  label,
  locationText = '',
  latitude,
  longitude,
  isOffline,
  showLocationText = false,
  layout = 'stacked',
  onChange,
}: LocationPickerProps) {
  const { t } = usePreferences();
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GeocodingResult[]>([]);

  async function handleSearch() {
    if (isOffline || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const found = await apiClient.searchLocation(searchQuery);
      setResults(found);
    } finally {
      setSearching(false);
    }
  }

  if (layout === 'horizontal') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
          <MapPin className="w-3.5 h-3.5 text-sky-600" />
          <span>{label}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-1.5">
            {!isOffline && (
              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleSearch();
                      }
                    }}
                    placeholder={t('searchLocationPlaceholder')}
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
                  />
                </div>
                <button
                  type="button"
                  disabled={searching}
                  onClick={() => void handleSearch()}
                  className="rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-medium px-3.5 py-2 cursor-pointer shrink-0"
                >
                  {searching ? '...' : t('searchLocationBtn')}
                </button>
              </div>
            )}

            {results.length > 0 && (
              <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 max-h-40 overflow-y-auto shadow-sm">
                {results.map((r) => (
                  <li key={`${r.latitude},${r.longitude}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange({
                          locationText: r.displayName,
                          latitude: String(r.latitude),
                          longitude: String(r.longitude),
                        });
                        setResults([]);
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 hover:bg-sky-50 cursor-pointer"
                    >
                      {r.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="any"
              placeholder="Latitude"
              value={latitude}
              onChange={(e) => onChange({ latitude: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry bg-white text-slate-900"
            />
            <input
              type="number"
              step="any"
              placeholder="Longitude"
              value={longitude}
              onChange={(e) => onChange({ longitude: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-telemetry bg-white text-slate-900"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
        <MapPin className="w-3.5 h-3.5 text-sky-600" />
        <span>{label}</span>
      </div>

      {!isOffline && (
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSearch();
                }
              }}
              placeholder={t('searchLocationPlaceholder')}
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-900"
            />
          </div>
          <button
            type="button"
            disabled={searching}
            onClick={() => void handleSearch()}
            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-medium px-3 py-1.5 cursor-pointer"
          >
            {searching ? '...' : t('searchLocationBtn')}
          </button>
        </div>
      )}

      {results.length > 0 && (
        <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 max-h-36 overflow-y-auto">
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button
                type="button"
                onClick={() => {
                  onChange({
                    locationText: r.displayName,
                    latitude: String(r.latitude),
                    longitude: String(r.longitude),
                  });
                  setResults([]);
                  setSearchQuery('');
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 hover:bg-sky-50 cursor-pointer"
              >
                {r.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={`grid gap-2 ${showLocationText ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
        {showLocationText && (
          <input
            type="text"
            placeholder={t('centerLocation')}
            value={locationText}
            onChange={(e) => onChange({ locationText: e.target.value })}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-900"
          />
        )}
        <input
          type="number"
          step="any"
          placeholder="Latitude"
          value={latitude}
          onChange={(e) => onChange({ latitude: e.target.value })}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs tabular-telemetry bg-white text-slate-900"
        />
        <input
          type="number"
          step="any"
          placeholder="Longitude"
          value={longitude}
          onChange={(e) => onChange({ longitude: e.target.value })}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs tabular-telemetry bg-white text-slate-900"
        />
      </div>
    </div>
  );
}

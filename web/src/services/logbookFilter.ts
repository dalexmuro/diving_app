import { type DiveMode, type DiveSummary, type GasType } from '../types/domain';

export type DepthBandFilter = 'all' | 'shallow' | 'medium' | 'deep';
export type EntryTypeFilter = 'all' | 'shore' | 'boat';

export interface LogbookFilterCriteria {
  query: string;
  year: string;
  gas: 'all' | GasType;
  depthBand: DepthBandFilter;
  mode?: 'all' | DiveMode;
  entryType?: EntryTypeFilter;
  explorationType?: 'all' | string;
}

function parseDiveTypes(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function filterDives(
  dives: DiveSummary[],
  criteria: LogbookFilterCriteria,
): DiveSummary[] {
  const q = criteria.query.trim().toLowerCase();
  const mode = criteria.mode ?? 'all';
  const entryType = criteria.entryType ?? 'all';
  const explorationType = criteria.explorationType ?? 'all';

  return dives.filter((d) => {
    if (criteria.year !== 'all' && !d.started_at.startsWith(criteria.year)) {
      return false;
    }
    if (criteria.gas !== 'all' && d.gas_type !== criteria.gas) {
      return false;
    }
    if (criteria.depthBand === 'shallow' && d.max_depth_m > 20) return false;
    if (criteria.depthBand === 'medium' && (d.max_depth_m <= 20 || d.max_depth_m > 40)) {
      return false;
    }
    if (criteria.depthBand === 'deep' && d.max_depth_m <= 40) return false;

    if (mode !== 'all' && d.dive_mode !== mode) {
      return false;
    }

    if (entryType !== 'all' || explorationType !== 'all') {
      const types = parseDiveTypes(d.dive_types_json);
      if (entryType !== 'all' && !types.includes(entryType)) {
        return false;
      }
      if (explorationType !== 'all' && !types.includes(explorationType)) {
        return false;
      }
    }

    if (q) {
      const haystack = [
        d.site_name ?? '',
        d.buddy ?? '',
        d.dive_center ?? '',
        d.computer_name ?? '',
        d.notes ?? '',
        d.tags_json ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

export function extractAvailableYears(dives: DiveSummary[]): string[] {
  const years = new Set<string>();
  for (const d of dives) {
    if (d.started_at.length >= 4) years.add(d.started_at.slice(0, 4));
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

const STANDARD_DIVE_TYPE_IDS = new Set(['shore', 'boat', 'cave', 'wreck', 'photo_bio', 'night']);

export function extractCustomExplorationTypes(dives: DiveSummary[]): string[] {
  const custom = new Set<string>();
  for (const d of dives) {
    for (const val of parseDiveTypes(d.dive_types_json)) {
      if (!STANDARD_DIVE_TYPE_IDS.has(val)) {
        custom.add(val);
      }
    }
  }
  return [...custom].sort((a, b) => a.localeCompare(b));
}

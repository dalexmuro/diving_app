import { type DiveSummary, type GasType } from '../types/domain';

export type DepthBandFilter = 'all' | 'shallow' | 'medium' | 'deep';

export interface LogbookFilterCriteria {
  query: string;
  year: string;
  gas: 'all' | GasType;
  depthBand: DepthBandFilter;
}

export function filterDives(
  dives: DiveSummary[],
  criteria: LogbookFilterCriteria,
): DiveSummary[] {
  const q = criteria.query.trim().toLowerCase();

  return dives.filter((d) => {
    if (criteria.year !== 'all' && !d.started_at.startsWith(criteria.year)) {
      return false;
    }
    if (criteria.gas !== 'all' && d.gas_type !== criteria.gas) {
      return false;
    }
    if (criteria.depthBand === 'shallow' && d.max_depth_m > 18) return false;
    if (criteria.depthBand === 'medium' && (d.max_depth_m <= 18 || d.max_depth_m > 30)) {
      return false;
    }
    if (criteria.depthBand === 'deep' && d.max_depth_m <= 30) return false;

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

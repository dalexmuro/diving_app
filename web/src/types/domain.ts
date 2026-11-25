export type Language = 'es' | 'fr';
export type UnitSystem = 'metric' | 'imperial';
export type RatingScale = 'poor' | 'normal' | 'good' | 'excellent';
export type WaterType = 'salt' | 'fresh';
export type TankMaterial = 'steel' | 'aluminum' | 'composite';
export type GasType = 'air' | 'nitrox' | 'trimix';

export type AppView =
  | 'dashboard'
  | 'logbook'
  | 'new-dive-choice'
  | 'dive-detail'
  | 'statistics'
  | 'sites'
  | 'gear-certs'
  | 'calculators'
  | 'settings';

export interface DecoStop {
  depth_m: number;
  duration_min: number;
}

export interface TelemetrySample {
  elapsedS: number;
  depthM: number | null;
  tempC?: number | null;
  pressureBar?: number | null;
  ascentRateMMin: number | null;
}

export interface ParsedFitPayload {
  fitHash: string;
  computerName: string | null;
  siteDescription: string | null;
  startedAt: string;
  endedAt: string | null;
  durationS: number;
  diveNumberInSeries: number | null;
  surfaceTimeS: number | null;
  maxDepthM: number;
  avgDepthM: number | null;
  minTempC: number | null;
  avgTempC: number | null;
  gasType: GasType;
  o2Pct: number;
  hePct: number;
  gfLow: number | null;
  gfHigh: number | null;
  startPressureBar: number | null;
  endPressureBar: number | null;
  samples: TelemetrySample[];
}

export interface DraftFitInit {
  parsed: ParsedFitPayload;
  fitBase64: string;
}

export interface DiveSummary {
  id: string;
  suunto_workout_key: string | null;
  fit_hash: string | null;
  started_at: string;
  ended_at: string | null;
  duration_s: number;
  computer_name: string | null;
  dive_number_in_series: number | null;
  surface_time_s: number | null;
  max_depth_m: number;
  avg_depth_m: number | null;
  min_temp_c: number | null;
  avg_temp_c: number | null;
  water_type: WaterType | null;
  gas_type: GasType;
  o2_pct: number;
  he_pct: number;
  deco: number;
  deco_time_s: number;
  deco_stops_json?: string;
  gf_low: number | null;
  gf_high: number | null;
  start_pressure_bar: number | null;
  end_pressure_bar: number | null;
  tank_volume_l: number | null;
  tank_material: TankMaterial | null;
  ballast_kg: number | null;
  site_id: string | null;
  site_name?: string | null;
  site_latitude?: number | null;
  site_longitude?: number | null;
  site_country?: string | null;
  buddy: string | null;
  buddies_json?: string;
  gear_used_json?: string;
  dive_center: string | null;
  dive_center_location?: string | null;
  dive_center_lat?: number | null;
  dive_center_lng?: number | null;
  tags_json: string;
  visibility: RatingScale | null;
  buoyancy: RatingScale | null;
  feeling: RatingScale | null;
  notes: string | null;
}

export interface DiveDetail extends DiveSummary {
  sac_l_min: number | null;
  samples: TelemetrySample[];
}

export interface DiveSite {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  notes: string | null;
  dive_count?: number;
  max_depth_m?: number | null;
  last_dive_at?: string | null;
}

export interface DiveCenter {
  id: string;
  name: string;
  location_text: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  created_at: string;
}

export interface Buddy {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
}

export interface DiveComputer {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  notes: string | null;
  created_at: string;
}

export interface GearItem {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  brand_model: string | null;
  notes: string | null;
  created_at: string;
}

export interface Certification {
  id: string;
  agency: string;
  level: string;
  cert_number: string | null;
  issued_date: string | null;
  created_at: string;
}

export interface UserSettings {
  language: Language;
  unit_system: UnitSystem;
  ascent_rate_limit_m_min: number;
}

export interface GlobalStats {
  totalDives: number;
  totalDurationS: number;
  maxDepthM: number;
  avgDepthM: number;
  minTempC: number | null;
  maxTempC: number | null;
  avgSacLMin: number | null;
  longestDiveS: number;
  byMonth: Array<{ month: string; count: number; durationS: number }>;
  depthBuckets: Array<{ bucket: string; count: number }>;
  gasBreakdown: Array<{ gas: GasType; count: number }>;
  tempBySeason: Array<{ season: string; avgTempC: number }>;
}

export interface ShapefileMetadata {
  id: string;
  name: string;
  stateFips: string;
  chamber: 'senate' | 'house' | 'congress' | 'custom';
  year: number;
  provenance: string;
  uploadedBy: string;
  comments: string;
  tags: string[];
  createdAt: string;
  districtCount: number;
  bounds: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  warnings: string[];
}

export interface ShapefileEntry {
  metadata: ShapefileMetadata;
  geojson: GeoJSON.FeatureCollection;
}

export interface CrosswalkRow {
  unit_id: string;
  total_pop: number;
  vap: number;
  black_vap: number;
  hispanic_vap: number;
  asian_vap: number;
  white_vap: number;
  dem_votes: number;
  rep_votes: number;
  lat: number;
  lon: number;
}

export interface DistrictMetrics {
  districtId: string;
  totalPop: number;
  vap: number;
  blackVap: number;
  hispanicVap: number;
  asianVap: number;
  whiteVap: number;
  minorityVapPct: number;
  demVotes: number;
  repVotes: number;
  partisanLean: number; // Dem share 0–100
}

export type ColorByMode =
  | 'partisan'
  | 'minority_vap'
  | 'pop'
  | 'flip'
  | 'competitive_change'
  | 'minority_change';

export interface DistrictDelta {
  districtId: string;        // Plan A district ID (display key)
  matchedBId: string;        // Plan B district ID matched to (may differ if renumbered)
  isRenumbered: boolean;     // true when the B plan uses a different district number
  a: DistrictMetrics;
  b: DistrictMetrics;
  deltaPop: number;
  deltaVap: number;
  deltaMinorityVapPct: number;
  deltaPartisanLean: number;
  minorityFlagged: boolean;  // |deltaMinorityVapPct| > 5
  // R script 7 equivalents
  bvapChangeLabel: string;       // 'Gained/Lost BVAP Majority/Influence' or ''
  mvapChangeLabel: string;       // 'Gained/Lost MVAP Majority/Influence' or ''
  partisanFlipLabel: string;     // 'Gained Dem' | 'Lost Dem' | ''
  competitiveChangeLabel: string; // 'Gained Competitive' | 'Lost Competitive' | ''
  popDeviation: number;          // b.totalPop - idealPop (plan B ideal)
  popDeviationPct: number;       // popDeviation / idealPop
}

// R script 4 / script 8 equivalents: district counts by VRA and partisan thresholds
export interface DistrictThresholds {
  competitive: number;   // 46.5%–53.5% Dem
  demDistricts: number;  // ≥50% Dem
  repDistricts: number;  // <50% Dem
  bvapMaj: number;       // BVAP ≥50%
  bvapInf: number;       // BVAP 37%–50%
  mvapMaj: number;       // MVAP ≥50%
  mvapInf: number;       // MVAP 37%–50%
  hvapMaj: number;       // HVAP ≥50%
  hvapInf: number;       // HVAP 37%–50%
  avapMaj: number;       // AVAP ≥50%
  avapInf: number;       // AVAP 37%–50%
  safetyTiers: Record<string, number>; // 6-tier safety breakdown
}

export interface FairnessMetrics {
  efficiencyGap: number;
  meanMedian: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  districtCount: number;
  bounds: [number, number, number, number];
  geometryType: string;
}

// CDM types — re-exported for convenience
export type {
  DisplacementMetrics,
  DistrictDisplacement,
  RedistrictingHistory,
  RedistrictingWave,
  ChamberWave,
} from './cdm';

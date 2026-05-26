/**
 * CDM TypeScript types — mirror of fdp/fdp/schema/models.py
 *
 * Keep in sync with:
 *   fdp/config/schema/redistricting_history.yml
 *   fdp/config/schema/displacement.yml
 *   fdp/fdp/schema/models.py
 */

export type Chamber = 'congress' | 'house' | 'senate';
export type Party = 'R' | 'D' | 'both';

// ---------------------------------------------------------------------------
// Redistricting history
// ---------------------------------------------------------------------------

export interface ChamberWave {
  chamber: Chamber;
  districtCount: number;
  allDistricts: boolean;
  /** Specific district IDs — empty until resolved from boundary file comparison. */
  districts: string[];
  notes?: string;
}

export interface RedistrictingWave {
  year: number;
  endYear?: number;
  label: string;
  party: Party;
  reason: string;
  legalContext?: string;
  electionResult?: string;
  chambers: ChamberWave[];
  totalDistrictsChanged: number;
  /** "2005" or "2005–2006" */
  displayYear: string;
}

export interface RedistrictingHistory {
  source: string;
  author: string;
  created: string;
  waves: RedistrictingWave[];
  totalDistrictsChanged: number;
  additionalBillsNotPassed: number;
}

// ---------------------------------------------------------------------------
// Displacement metrics
// ---------------------------------------------------------------------------

export type DisplacementMethod = 'area_weighted' | 'centroid';

export interface DisplacementMetrics {
  planAId: string;
  planBId: string;
  totalPop: number;
  displacedPop: number;
  displacedPct: number;
  minRequiredDisplacedPop: number;
  minRequiredDisplacedPct: number;
  /** Key advocacy metric: people moved beyond what was required. */
  excessDisplacedPop: number;
  excessDisplacedPct: number;
  districtCount: number;
  method: DisplacementMethod;
}

export interface DistrictDisplacement {
  districtIdA: string;
  /** Dominant Plan B district (largest area overlap). */
  districtIdB: string;
  popA: number;
  displacedFromA: number;
  displacedPct: number;
}

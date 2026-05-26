/**
 * Mid-decade redistricting history — Georgia 2001–2023.
 *
 * Manually mirrored from FDP CDM data:
 *   fdp/data/repos/main/history/redistricting_waves.yml
 *
 * Source: FDGA analysis of enacted legislation and election results, 2000–2024
 * Author: Jane Branscomb, 2026-02-16
 *
 * The `districts` arrays are empty until specific district IDs are resolved
 * by comparing historical boundary files through the FDP displacement tool.
 */

import type { RedistrictingHistory, RedistrictingWave } from '../types/cdm';

export const REDISTRICTING_HISTORY: RedistrictingHistory = {
  source: 'FDGA analysis of enacted legislation and election results, 2000–2024',
  author: 'Jane Branscomb',
  created: '2026-02-16',
  totalDistrictsChanged: 71,
  additionalBillsNotPassed: 33,
  waves: [
    {
      year: 2005,
      endYear: 2006,
      label: '2005–2006 Mid-Decade Redistricting',
      displayYear: '2005–2006',
      party: 'R',
      reason: '"We\'re fixing the Democratic gerrymander" of 2001',
      legalContext: 'Challenged in court; allowed by GA Supreme Court in Blum v. Schrader, 2006',
      electionResult: 'Rs gain 10 House seats despite virtually level statewide vote share',
      chambers: [
        { chamber: 'congress', districtCount: 13, allDistricts: true,  districts: [], notes: 'All 13 congressional districts redrawn' },
        { chamber: 'house',    districtCount: 11, allDistricts: false, districts: [] },
      ],
      totalDistrictsChanged: 24,
    },
    {
      year: 2012,
      label: '2012 Mid-Decade Redistricting',
      displayYear: '2012',
      party: 'R',
      reason: 'Produce Republican super-majority',
      electionResult: 'Rs achieve super-majority in Senate, 1 seat shy in House, despite 2.4% decline in statewide vote share',
      chambers: [
        { chamber: 'house', districtCount: 23, allDistricts: false, districts: [] },
      ],
      totalDistrictsChanged: 23,
    },
    {
      year: 2015,
      label: '2015 Mid-Decade Redistricting',
      displayYear: '2015',
      party: 'both',
      reason: '"Make districts better for incumbents to get re-elected"',
      legalContext: 'Court deposition of Gina Wright, LCRO, in GA NAACP v. Georgia, 2017',
      electionResult: 'Incumbents re-elected in altered districts',
      chambers: [
        { chamber: 'house', districtCount: 17, allDistricts: false, districts: [] },
      ],
      totalDistrictsChanged: 17,
    },
    {
      year: 2023,
      label: '2023 Mid-Decade Redistricting',
      displayYear: '2023',
      party: 'R',
      reason: 'Complies with court order; goes beyond to maintain partisan advantage',
      legalContext: 'Senator Bill Cowsert: "We\'re maintaining the existing partisan balance"',
      electionResult: 'All districts altered as partisan take-backs are won as expected',
      chambers: [
        { chamber: 'congress', districtCount: 1, allDistricts: false, districts: [], notes: 'Court-ordered VRA change' },
        { chamber: 'house',    districtCount: 6, allDistricts: false, districts: [], notes: 'Partisan take-backs' },
      ],
      totalDistrictsChanged: 7,
    },
  ],
};

/** Tailwind/hex color per wave year — consistent across map and timeline. */
export const WAVE_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  2005: { bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-300' },
  2012: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  2015: { bg: 'bg-rose-100',   text: 'text-rose-800',   border: 'border-rose-300' },
  2023: { bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-300' },
};

export const WAVE_HEX: Record<number, string> = {
  2005: '#d97706',
  2012: '#ea580c',
  2015: '#e11d48',
  2023: '#dc2626',
};

export function waveForYear(year: number): RedistrictingWave | undefined {
  return REDISTRICTING_HISTORY.waves.find(w => w.year === year);
}

export function partyLabel(party: 'R' | 'D' | 'both'): string {
  return party === 'R' ? 'Republican' : party === 'D' ? 'Democrat' : 'Bipartisan';
}

export function partyColor(party: 'R' | 'D' | 'both'): string {
  return party === 'R' ? 'text-red-700' : party === 'D' ? 'text-blue-700' : 'text-purple-700';
}

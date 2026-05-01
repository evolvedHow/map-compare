import type { DistrictMetrics, FairnessMetrics } from '../types';

export function computeFairness(districts: DistrictMetrics[]): FairnessMetrics {
  return {
    efficiencyGap: efficiencyGap(districts),
    meanMedian: meanMedianDifference(districts)
  };
}

function efficiencyGap(districts: DistrictMetrics[]): number {
  let wastedDem = 0;
  let wastedRep = 0;
  let totalVotes = 0;

  for (const d of districts) {
    const dem = d.demVotes;
    const rep = d.repVotes;
    const total = dem + rep;
    if (total === 0) continue;

    totalVotes += total;
    const majority = Math.floor(total / 2) + 1;

    if (dem >= rep) {
      wastedDem += dem - majority;
      wastedRep += rep;
    } else {
      wastedRep += rep - majority;
      wastedDem += dem;
    }
  }

  return totalVotes === 0 ? 0 : (wastedDem - wastedRep) / totalVotes;
}

function meanMedianDifference(districts: DistrictMetrics[]): number {
  const shares = districts
    .filter(d => d.demVotes + d.repVotes > 0)
    .map(d => d.demVotes / (d.demVotes + d.repVotes));

  if (shares.length === 0) return 0;

  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  const sorted = [...shares].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  return mean - median;
}

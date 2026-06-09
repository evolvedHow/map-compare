<script lang="ts">
  import type { DistrictDelta, FairnessMetrics, DistrictThresholds } from '../types';
  import type { DistrictCompactness } from '../utils/compactnessMetrics';
  import { avgScore } from '../utils/compactnessMetrics';

  interface PlanSummary {
    name: string;
    year: number;
    n: number;
    maxDev: number;
    demSeats: number;
    repSeats: number;
    bvapMaj: number;
    mmDistricts: number;
    competitive: number;
  }

  interface Props {
    planA: PlanSummary;
    planB: PlanSummary;
    fairnessA: FairnessMetrics;
    fairnessB: FairnessMetrics;
    threshA: DistrictThresholds;
    threshB: DistrictThresholds;
    compactnessA: Map<string, DistrictCompactness>;
    compactnessB: Map<string, DistrictCompactness>;
    countySplitsA: number | null;
    countySplitsB: number | null;
    deltas: DistrictDelta[];
  }

  let {
    planA, planB, fairnessA, fairnessB,
    threshA, threshB,
    compactnessA, compactnessB,
    countySplitsA, countySplitsB,
    deltas
  }: Props = $props();

  const avgPPA = $derived(avgScore(compactnessA, 'polsbyPopper'));
  const avgPPB = $derived(avgScore(compactnessB, 'polsbyPopper'));

  const nFlips = $derived(deltas.filter(d => d.partisanFlipLabel !== '').length);
  const nCompChange = $derived(deltas.filter(d => d.competitiveChangeLabel !== '').length);
  const nVraChange = $derived(deltas.filter(d => d.bvapChangeLabel !== '' || d.mvapChangeLabel !== '').length);

  function fmtEG(n: number) {
    return `${n > 0 ? 'D' : 'R'}+${(Math.abs(n) * 100).toFixed(1)}%`;
  }

  // Categories with score (A/B values) and placeholder for manual assessment
  // Scores are rated 1–5 where 5 = best/most fair
  let popEqualityComment = $state('');
  let compactnessComment = $state('');
  let partisanFairnessComment = $state('');
  let vrawComment = $state('');
  let competitivenessComment = $state('');
  let overallComment = $state('');
  let reviewerName = $state('');
  let reviewerOrg = $state('');
  let reviewDate = $state('');

  // Checkbox-style assessment
  type Rating = 'acceptable' | 'concern' | 'major_concern' | '';
  let popRating = $state<Rating>('');
  let compactRating = $state<Rating>('');
  let partisanRating = $state<Rating>('');
  let vraRating = $state<Rating>('');
  let competitiveRating = $state<Rating>('');

  const ratingColors: Record<Rating, string> = {
    acceptable: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    concern: 'text-amber-700 bg-amber-50 border-amber-200',
    major_concern: 'text-red-700 bg-red-50 border-red-200',
    '': 'text-gray-400 bg-gray-50 border-gray-200',
  };
  const ratingLabels: Record<Rating, string> = {
    acceptable: '✓ Acceptable',
    concern: '⚠ Concern',
    major_concern: '✗ Major Concern',
    '': '— Not rated',
  };
</script>

<section class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:overflow-visible print:break-before-page">
  <div class="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
    <div>
      <h3 class="text-sm font-bold text-gray-800">Scoring Rubric</h3>
      <p class="text-[11px] text-gray-400 mt-0.5">Fill in comments and ratings before printing. All fields are editable.</p>
    </div>
    <span class="text-[10px] text-gray-400 italic print:hidden">Click any field to edit</span>
  </div>

  <div class="p-5 space-y-5">

    <!-- Plan identification -->
    <div class="grid grid-cols-2 gap-4 pb-4 border-b border-gray-100">
      <div>
        <p class="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Baseline Plan (A)</p>
        <p class="text-sm font-semibold text-gray-800">{planA.name}</p>
        <p class="text-xs text-gray-500">{planA.year} · {planA.n} districts</p>
      </div>
      <div>
        <p class="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Comparison Plan (B)</p>
        <p class="text-sm font-semibold text-gray-800">{planB.name}</p>
        <p class="text-xs text-gray-500">{planB.year} · {planB.n} districts</p>
      </div>
    </div>

    <!-- Rubric categories -->
    {#each [
      {
        id: 'pop',
        label: 'Population Equality',
        desc: 'Maximum deviation from ideal district size',
        aVal: `±${planA.maxDev.toFixed(1)}%`,
        bVal: `±${planB.maxDev.toFixed(1)}%`,
        standard: 'Congressional: ±1% | Legislative: ±5%',
        rating: popRating,
        setRating: (v: Rating) => popRating = v,
        comment: popEqualityComment,
        setComment: (v: string) => popEqualityComment = v,
      },
      {
        id: 'compact',
        label: 'Compactness',
        desc: 'Average Polsby-Popper score (0–1, higher = more compact)',
        aVal: avgPPA.toFixed(3),
        bVal: avgPPB.toFixed(3),
        standard: 'County splits A: ' + (countySplitsA ?? '—') + ' | B: ' + (countySplitsB ?? '—'),
        rating: compactRating,
        setRating: (v: Rating) => compactRating = v,
        comment: compactnessComment,
        setComment: (v: string) => compactnessComment = v,
      },
      {
        id: 'partisan',
        label: 'Partisan Fairness',
        desc: 'Efficiency gap and partisan composition',
        aVal: `EG ${fmtEG(fairnessA.efficiencyGap)} · ${planA.demSeats}D/${planA.repSeats}R`,
        bVal: `EG ${fmtEG(fairnessB.efficiencyGap)} · ${planB.demSeats}D/${planB.repSeats}R`,
        standard: `${nFlips} partisan flips · ${nCompChange} competitive seats changed`,
        rating: partisanRating,
        setRating: (v: Rating) => partisanRating = v,
        comment: partisanFairnessComment,
        setComment: (v: string) => partisanFairnessComment = v,
      },
      {
        id: 'vra',
        label: 'VRA / Minority Representation',
        desc: 'Majority-minority districts and BVAP thresholds',
        aVal: `${planA.bvapMaj} BVAP maj · ${planA.mmDistricts} MM`,
        bVal: `${planB.bvapMaj} BVAP maj · ${planB.mmDistricts} MM`,
        standard: `${nVraChange} districts crossed BVAP/MVAP threshold`,
        rating: vraRating,
        setRating: (v: Rating) => vraRating = v,
        comment: vrawComment,
        setComment: (v: string) => vrawComment = v,
      },
      {
        id: 'competitive',
        label: 'Competitiveness',
        desc: 'Districts within ±7% margin (46.5–53.5% Dem)',
        aVal: `${threshA.competitive} competitive`,
        bVal: `${threshB.competitive} competitive`,
        standard: 'FDGA A-grade: 2–6 Senate, 11–20 House',
        rating: competitiveRating,
        setRating: (v: Rating) => competitiveRating = v,
        comment: competitivenessComment,
        setComment: (v: string) => competitivenessComment = v,
      },
    ] as cat}
      <div class="border border-gray-200 rounded-xl overflow-hidden">
        <!-- Header row -->
        <div class="bg-gray-50 px-4 py-2.5 flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <p class="text-xs font-bold text-gray-800">{cat.label}</p>
            <p class="text-[11px] text-gray-400">{cat.desc}</p>
          </div>
          <!-- Rating selector -->
          <div class="flex gap-1 shrink-0 print:hidden">
            {#each (['acceptable', 'concern', 'major_concern'] as const) as r}
              <button
                onclick={() => cat.setRating(cat.rating === r ? '' : r)}
                class="px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors
                  {cat.rating === r ? ratingColors[r] : 'text-gray-400 bg-white border-gray-200 hover:bg-gray-50'}"
              >
                {ratingLabels[r]}
              </button>
            {/each}
          </div>
          <!-- Print-only rating display -->
          <div class="hidden print:block shrink-0">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold border {ratingColors[cat.rating]}">
              {ratingLabels[cat.rating]}
            </span>
          </div>
        </div>

        <!-- A/B values + standard -->
        <div class="px-4 py-2 grid grid-cols-3 gap-3 border-t border-gray-100 text-xs">
          <div>
            <span class="text-[10px] font-bold text-blue-500 uppercase">Plan A</span>
            <p class="text-gray-800 font-mono mt-0.5">{cat.aVal}</p>
          </div>
          <div>
            <span class="text-[10px] font-bold text-amber-500 uppercase">Plan B</span>
            <p class="text-gray-800 font-mono mt-0.5">{cat.bVal}</p>
          </div>
          <div>
            <span class="text-[10px] font-bold text-gray-400 uppercase">Standard / Note</span>
            <p class="text-gray-500 mt-0.5">{cat.standard}</p>
          </div>
        </div>

        <!-- Comment field -->
        <div class="px-4 pb-3 border-t border-dashed border-gray-100">
          <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-2 mb-1 print:hidden">Analyst Comments</p>
          <!-- Screen: textarea -->
          <textarea
            class="w-full text-xs text-gray-700 border border-gray-200 rounded-lg px-3 py-2 resize-y min-h-[52px] focus:outline-none focus:ring-1 focus:ring-blue-300 print:hidden placeholder-gray-300"
            placeholder="Enter assessment, concerns, or justification…"
            value={cat.comment}
            oninput={(e) => cat.setComment((e.target as HTMLTextAreaElement).value)}
          ></textarea>
          <!-- Print: comment text -->
          <p class="hidden print:block text-xs text-gray-700 min-h-[40px] whitespace-pre-wrap leading-relaxed">
            {cat.comment || '(no comment)'}
          </p>
        </div>
      </div>
    {/each}

    <!-- Overall recommendation -->
    <div class="border-2 border-gray-800 rounded-xl overflow-hidden">
      <div class="bg-gray-800 px-4 py-2.5">
        <p class="text-xs font-bold text-white">Overall Recommendation</p>
        <p class="text-[11px] text-gray-400">Summarize findings and recommend Accept / Reject / Request Revision</p>
      </div>
      <div class="px-4 py-3">
        <textarea
          class="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2.5 resize-y min-h-[80px] focus:outline-none focus:ring-1 focus:ring-blue-300 print:hidden placeholder-gray-300"
          placeholder="Overall assessment and recommendation (Accept / Reject / Request Revision)…"
          value={overallComment}
          oninput={(e) => overallComment = (e.target as HTMLTextAreaElement).value}
        ></textarea>
        <p class="hidden print:block text-sm text-gray-700 min-h-[60px] whitespace-pre-wrap leading-relaxed">
          {overallComment || '(no comment)'}
        </p>
      </div>
    </div>

    <!-- Reviewer signature block -->
    <div class="grid grid-cols-3 gap-4 pt-3 border-t border-gray-200">
      <div>
        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Reviewer Name</p>
        <input
          class="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 print:border-0 print:border-b print:border-gray-400 print:rounded-none"
          type="text"
          placeholder="Your name"
          bind:value={reviewerName}
        />
      </div>
      <div>
        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Organization</p>
        <input
          class="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 print:border-0 print:border-b print:border-gray-400 print:rounded-none"
          type="text"
          placeholder="FairDistricts GA, etc."
          bind:value={reviewerOrg}
        />
      </div>
      <div>
        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Review Date</p>
        <input
          class="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 print:border-0 print:border-b print:border-gray-400 print:rounded-none"
          type="text"
          placeholder="YYYY-MM-DD"
          bind:value={reviewDate}
        />
      </div>
    </div>

  </div>
</section>

<style>
  @media print {
    textarea, input { border: none !important; border-bottom: 1px solid #ccc !important; background: transparent; padding-left: 0; }
  }
</style>

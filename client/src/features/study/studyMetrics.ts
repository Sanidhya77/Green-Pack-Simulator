import type { ReasonValue, StudyPart, TrialDefinition, TrialOption } from "./trials";
import { REASON_OPTIONS } from "./trials";

export type TrialRecord = {
  part: StudyPart;
  trialIndex: number;
  productName: string;
  optionId: string;
  optionCode: string;
  packagingType: string;
  price: number;
  sustainabilityScore: number;
  sustainabilityRank: number;
  gapVsBest: number;
  reason: ReasonValue;
  confidence: number;
  reflection?: string;
};

export type PartMetrics = {
  trialCount: number;
  mostSustainablePicks: number;
  avgSustainabilityScore: number;
  avgGapVsBest: number;
  avgConfidence: number;
  priceReasonCount: number;
  sustainabilityReasonCount: number;
  labelReasonCount: number;
  gutReasonCount: number;
  otherReasonCount: number;
};

export type PartComparisonRow = {
  label: string;
  partA: string;
  partB: string;
  difference: string;
};

export function getOptionRankAndGap(options: TrialOption[], selectedOptionId: string) {
  const sorted = [...options].sort((a, b) => b.sustainabilityScore - a.sustainabilityScore);
  const selected = options.find((o) => o.id === selectedOptionId);
  if (!selected) {
    return { rank: 1, gapVsBest: 0, selectedScore: 0, bestScore: 0 };
  }
  const best = sorted[0];
  return {
    rank: sorted.findIndex((o) => o.id === selectedOptionId) + 1,
    gapVsBest: best.sustainabilityScore - selected.sustainabilityScore,
    selectedScore: selected.sustainabilityScore,
    bestScore: best.sustainabilityScore,
  };
}

export function buildTrialRecord(
  trial: TrialDefinition,
  option: TrialOption,
  reason: ReasonValue,
  confidence: number,
  reflection?: string,
): TrialRecord {
  const { rank, gapVsBest, selectedScore } = getOptionRankAndGap(trial.options, option.id);
  return {
    part: trial.part,
    trialIndex: trial.indexInPart,
    productName: trial.productName,
    optionId: option.id,
    optionCode: option.optionCode,
    packagingType: option.packagingType,
    price: option.price,
    sustainabilityScore: selectedScore,
    sustainabilityRank: rank,
    gapVsBest,
    reason,
    confidence,
    reflection: reflection?.trim() || undefined,
  };
}

export function computePartMetrics(records: TrialRecord[]): PartMetrics {
  if (records.length === 0) {
    return {
      trialCount: 0,
      mostSustainablePicks: 0,
      avgSustainabilityScore: 0,
      avgGapVsBest: 0,
      avgConfidence: 0,
      priceReasonCount: 0,
      sustainabilityReasonCount: 0,
      labelReasonCount: 0,
      gutReasonCount: 0,
      otherReasonCount: 0,
    };
  }

  const n = records.length;
  return {
    trialCount: n,
    mostSustainablePicks: records.filter((r) => r.sustainabilityRank === 1).length,
    avgSustainabilityScore: Math.round(records.reduce((s, r) => s + r.sustainabilityScore, 0) / n),
    avgGapVsBest: Math.round(records.reduce((s, r) => s + r.gapVsBest, 0) / n),
    avgConfidence: Number((records.reduce((s, r) => s + r.confidence, 0) / n).toFixed(1)),
    priceReasonCount: records.filter((r) => r.reason === "price").length,
    sustainabilityReasonCount: records.filter((r) => r.reason === "sustainability").length,
    labelReasonCount: records.filter((r) => r.reason === "label").length,
    gutReasonCount: records.filter((r) => r.reason === "gut").length,
    otherReasonCount: records.filter((r) => r.reason === "other").length,
  };
}

function formatDelta(a: number, b: number, suffix = ""): string {
  const d = b - a;
  if (d === 0) return "No change";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d}${suffix}`;
}

export function buildComparisonTable(partA: PartMetrics, partB: PartMetrics): PartComparisonRow[] {
  return [
    {
      label: "Most sustainable option chosen",
      partA: `${partA.mostSustainablePicks} / ${partA.trialCount}`,
      partB: `${partB.mostSustainablePicks} / ${partB.trialCount}`,
      difference: formatDelta(partA.mostSustainablePicks, partB.mostSustainablePicks),
    },
    {
      label: "Average sustainability of choices (0–100)",
      partA: `${partA.avgSustainabilityScore}`,
      partB: `${partB.avgSustainabilityScore}`,
      difference: formatDelta(partA.avgSustainabilityScore, partB.avgSustainabilityScore),
    },
    {
      label: "Average gap vs best option (points)",
      partA: `${partA.avgGapVsBest}`,
      partB: `${partB.avgGapVsBest}`,
      difference: formatDelta(partA.avgGapVsBest, partB.avgGapVsBest, " (lower is greener)"),
    },
    {
      label: "Average confidence (1–5)",
      partA: `${partA.avgConfidence}`,
      partB: `${partB.avgConfidence}`,
      difference: formatDelta(partA.avgConfidence, partB.avgConfidence),
    },
    {
      label: "Price as main reason",
      partA: `${partA.priceReasonCount} / ${partA.trialCount}`,
      partB: `${partB.priceReasonCount} / ${partB.trialCount}`,
      difference: formatDelta(partA.priceReasonCount, partB.priceReasonCount),
    },
    {
      label: "Sustainability as main reason",
      partA: `${partA.sustainabilityReasonCount} / ${partA.trialCount}`,
      partB: `${partB.sustainabilityReasonCount} / ${partB.trialCount}`,
      difference: formatDelta(partA.sustainabilityReasonCount, partB.sustainabilityReasonCount),
    },
  ];
}

export function reasonLabel(value: ReasonValue): string {
  return REASON_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

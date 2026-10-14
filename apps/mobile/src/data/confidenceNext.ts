import { DOMAIN_CONFIG, type DeviationEstimate, type DomainConfig } from "@notebus/domain";
import type { MessageKey } from "../i18n";

/** A frase de "como a confiança sobe" da folha "Por que este horário" (D-120, ux/4.8 §7.5); os números vêm do config. */
export function confidenceNext(
  estimate: Pick<DeviationEstimate, "confidence" | "count" | "recentCount" | "rangeStart" | "rangeEnd">,
  config: DomainConfig = DOMAIN_CONFIG,
): { key: MessageKey; params: Record<string, number> } {
  const { confidence, count, recentCount } = estimate;
  const toMedium = config.mediumFromRecords - count;
  const toHigh = config.highFromRecords - recentCount;
  switch (confidence) {
    case "estimated":
      return { key: "why.next.to_medium_from_zero", params: { n: config.mediumFromRecords } };
    case "low":
      return toMedium > 1 ? { key: "why.next.to_medium", params: { n: toMedium } } : { key: "why.next.to_medium_one", params: {} };
    case "medium":
      if (toHigh > 1) return { key: "why.next.to_high", params: { n: toHigh, days: config.recentWindowDays } };
      if (toHigh === 1) return { key: "why.next.to_high_one", params: { days: config.recentWindowDays } };
      return { key: "why.next.to_high_range", params: { minutes: config.highMaxRangeMinutes } };
    case "high":
      return { key: "why.next.high", params: { n: recentCount, width: Math.round(estimate.rangeEnd - estimate.rangeStart) } };
  }
}

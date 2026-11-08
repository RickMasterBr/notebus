/**
 * Decisão do fluxo de embarque quando há viagem aberta (D-403, D-416, D-427).
 * Puro: sem banco, sem relógio, sem React.
 */
import { formatServiceMinute, lisbonWallClock } from "@notebus/domain";
import { type MessageKey, t } from "../i18n";

export interface OpenRideInput {
  rideId: string;
  lineCode: string;
  boardedTime: string;
}

export type BoardStepResult =
  | { kind: "board" }
  | { kind: "choose"; rideId: string; tapAt: number; title: string; subtitle: string };

export function boardStep(input: {
  openRide: OpenRideInput | null;
  tapAt: number;
}): BoardStepResult {
  if (!input.openRide) {
    return { kind: "board" };
  }
  const time = formatServiceMinute(lisbonWallClock(input.tapAt).minute);
  return {
    kind: "choose",
    rideId: input.openRide.rideId,
    tapAt: input.tapAt,
    title: t("board_over.title", { line: input.openRide.lineCode, time: input.openRide.boardedTime }),
    subtitle: t("board_over.subtitle", { time }),
  };
}

export interface BoardOverOption {
  id: "descida" | "dispensar" | "conferir" | "cancelar";
  labelKey: MessageKey;
  tone: "primary" | "danger" | "plain" | "cancel";
}

export function boardOverOptions(): BoardOverOption[] {
  return [
    { id: "descida", labelKey: "board_over.option.alighted", tone: "primary" },
    { id: "dispensar", labelKey: "board_over.option.dismiss", tone: "danger" },
    { id: "conferir", labelKey: "board_over.option.review", tone: "plain" },
    { id: "cancelar", labelKey: "common.cancel", tone: "cancel" },
  ];
}

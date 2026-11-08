import { describe, expect, it } from "vitest";
import { boardOverOptions, boardStep } from "./boardOverFlow";

describe("boardOverFlow", () => {
  // Quinta 08/10/2026 13:30 Lisboa (UTC+1, 12:30 UTC = 1728390600000 ms)
  const tapAt = Date.UTC(2026, 9, 8, 12, 30); // 13:30 Lisboa

  it("sem viagem aberta: devolve board direto", () => {
    const res = boardStep({ openRide: null, tapAt });
    expect(res).toEqual({ kind: "board" });
  });

  it("com viagem aberta: devolve choose com rideId, tapAt, título e subtítulo", () => {
    const res = boardStep({
      openRide: { rideId: "ride-123", lineCode: "L9", boardedTime: "13:04" },
      tapAt,
    });
    expect(res).toEqual({
      kind: "choose",
      rideId: "ride-123",
      tapAt,
      title: "Você ainda está na viagem da L9, desde 13:04",
      subtitle: "Embarque novo às 13:30",
    });
  });

  it("monta as opções na ordem exata: Desci em, Dispensar, Conferir, Cancelar", () => {
    const options = boardOverOptions();
    expect(options).toEqual([
      { id: "descida", labelKey: "board_over.option.alighted", tone: "primary" },
      { id: "dispensar", labelKey: "board_over.option.dismiss", tone: "danger" },
      { id: "conferir", labelKey: "board_over.option.review", tone: "plain" },
      { id: "cancelar", labelKey: "common.cancel", tone: "cancel" },
    ]);
  });
});

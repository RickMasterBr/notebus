import { describe, expect, it } from "vitest";
import { stopCardLeaveAtSubtitle, type PlaceRef, type WalkTimeRef } from "./stopCardLeaveAt";
import type { StopCard } from "./stopCard";

describe("stopCardLeaveAtSubtitle", () => {
  const mockCard: StopCard = {
    stopId: "stop-arrabalde",
    name: "Arrabalde da Ponte",
    lines: [
      {
        code: "1",
        color: "#7CB342",
        destination: "Estação",
        state: {
          status: "next",
          time: "08:14",
          rangeStart: "08:08",
          rangeEnd: "08:16",
          beAtStop: "08:07",
          confidence: "medium",
          mayPassNow: false,
        },
      },
    ],
  };

  const mockPlaces: PlaceRef[] = [
    { id: "place-casa", name: "Casa", deletedAt: null },
    { id: "place-facul", name: "Facul", deletedAt: null },
  ];

  it("calcula subtítulo 'sair às 07:59 · Casa' quando beAtStop é 08:07 e tempo a pé é 8 min", () => {
    const walkTimes: WalkTimeRef[] = [
      {
        stopId: "stop-arrabalde",
        placeId: "place-casa",
        minutesMin: 8,
        minutesMax: null,
        deletedAt: null,
      },
    ];

    const result = stopCardLeaveAtSubtitle(mockCard, mockPlaces, walkTimes);
    expect(result).toBe("sair às 07:59 · Casa");
  });

  it("usa o maior valor da faixa a pé (D-100)", () => {
    const walkTimes: WalkTimeRef[] = [
      {
        stopId: "stop-arrabalde",
        placeId: "place-casa",
        minutesMin: 8,
        minutesMax: 10,
        deletedAt: null,
      },
    ];

    // 08:07 (487 min) - 10 min = 477 min (07:57)
    const result = stopCardLeaveAtSubtitle(mockCard, mockPlaces, walkTimes);
    expect(result).toBe("sair às 07:57 · Casa");
  });

  it("prioriza Casa mesmo se outro lugar aparecer antes na lista", () => {
    const places: PlaceRef[] = [
      { id: "place-trabalho", name: "Trabalho", deletedAt: null },
      { id: "place-casa", name: "Casa", deletedAt: null },
    ];
    const walkTimes: WalkTimeRef[] = [
      {
        stopId: "stop-arrabalde",
        placeId: "place-trabalho",
        minutesMin: 5,
        minutesMax: null,
        deletedAt: null,
      },
      {
        stopId: "stop-arrabalde",
        placeId: "place-casa",
        minutesMin: 8,
        minutesMax: null,
        deletedAt: null,
      },
    ];

    const result = stopCardLeaveAtSubtitle(mockCard, places, walkTimes);
    expect(result).toBe("sair às 07:59 · Casa");
  });

  it("usa o primeiro lugar se Casa não estiver associada ao ponto", () => {
    const places: PlaceRef[] = [
      { id: "place-trabalho", name: "Trabalho", deletedAt: null },
    ];
    const walkTimes: WalkTimeRef[] = [
      {
        stopId: "stop-arrabalde",
        placeId: "place-trabalho",
        minutesMin: 7,
        minutesMax: null,
        deletedAt: null,
      },
    ];

    // 08:07 - 7 min = 08:00
    const result = stopCardLeaveAtSubtitle(mockCard, places, walkTimes);
    expect(result).toBe("sair às 08:00 · Trabalho");
  });

  it("retorna null se não houver tempo a pé para o ponto", () => {
    const walkTimes: WalkTimeRef[] = [
      {
        stopId: "other-stop",
        placeId: "place-casa",
        minutesMin: 8,
        minutesMax: null,
        deletedAt: null,
      },
    ];

    const result = stopCardLeaveAtSubtitle(mockCard, mockPlaces, walkTimes);
    expect(result).toBeNull();
  });

  it("retorna null se a linha não tiver próximo ônibus (sem viagens hoje)", () => {
    const cardLater: StopCard = {
      stopId: "stop-arrabalde",
      name: "Arrabalde da Ponte",
      lines: [
        {
          code: "1",
          color: "#7CB342",
          destination: "Estação",
          state: {
            status: "later",
            reason: null,
            date: "2026-10-02",
            weekday: 5,
            time: "07:30",
          },
        },
      ],
    };
    const walkTimes: WalkTimeRef[] = [
      {
        stopId: "stop-arrabalde",
        placeId: "place-casa",
        minutesMin: 8,
        minutesMax: null,
        deletedAt: null,
      },
    ];

    const result = stopCardLeaveAtSubtitle(cardLater, mockPlaces, walkTimes);
    expect(result).toBeNull();
  });
});

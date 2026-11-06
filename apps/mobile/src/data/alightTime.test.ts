// A hora da descida anotada depois (D-418). Valores calculados à mão no comentário.
import { describe, expect, it } from "vitest";
import { LATE_ALIGHT_MIN, alightRecordTime } from "./alightTime";

const NOW = Date.parse("2026-10-08T10:00:00Z");

describe("alightRecordTime", () => {
  it("fronteira de 5 min: 4 e 5 min ainda é ao vivo; 6 min já é anotado depois", () => {
    // 4 min de atraso: a hora do toque, ao vivo.
    expect(alightRecordTime({ expectedMinute: 492, nowMinute: 496, now: NOW })).toEqual({ observedAt: NOW, mode: "live" });
    // 5 min exatos: ainda ao vivo (o corte é "mais de 5").
    expect(alightRecordTime({ expectedMinute: 492, nowMinute: 497, now: NOW })).toEqual({ observedAt: NOW, mode: "live" });
    // 6 min: a hora esperada da paragem, 6 min antes do toque.
    expect(alightRecordTime({ expectedMinute: 492, nowMinute: 498, now: NOW })).toEqual({
      observedAt: NOW - 6 * 60_000,
      mode: "later",
    });
    expect(LATE_ALIGHT_MIN).toBe(5);
  });

  it("sem a hora esperada da paragem, grava ao vivo na hora do toque", () => {
    expect(alightRecordTime({ expectedMinute: null, nowMinute: 498, now: NOW })).toEqual({ observedAt: NOW, mode: "live" });
  });

  it("sem o minuto agora, grava ao vivo na hora do toque", () => {
    expect(alightRecordTime({ expectedMinute: 492, nowMinute: null, now: NOW })).toEqual({ observedAt: NOW, mode: "live" });
  });

  it("minutos com decimais: 7,75 min de atraso desloca 7 min e 45 s", () => {
    // 500,25 − 492,5 = 7,75 min = 465 000 ms.
    expect(alightRecordTime({ expectedMinute: 492.5, nowMinute: 500.25, now: NOW })).toEqual({
      observedAt: NOW - 465_000,
      mode: "later",
    });
  });

  it("atraso negativo (a paragem ainda não passou) é ao vivo", () => {
    expect(alightRecordTime({ expectedMinute: 500, nowMinute: 498, now: NOW })).toEqual({ observedAt: NOW, mode: "live" });
  });
});

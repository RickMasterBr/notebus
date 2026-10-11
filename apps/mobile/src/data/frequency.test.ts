import { describe, expect, it } from "vitest";
import { MAX_FREQUENCY_TRIPS, departureMinutesFromClock, firstStopMinute, frequencyMinutes } from "./frequency";

const ok = (r: ReturnType<typeof frequencyMinutes>) => {
  if (!r.ok) throw new Error(`recusou: ${r.reason}`);
  return r.minutes;
};

describe("frequencyMinutes", () => {
  it("T-84: 06:40 a 19:40, a cada 30 → 27 saídas, de 400 a 1180", () => {
    const minutes = ok(frequencyMinutes({ fromMinute: 400, toMinute: 1180, headwayMinutes: 30 }));
    expect(minutes).toHaveLength(27);
    expect(minutes[0]).toBe(400);
    expect(minutes[26]).toBe(1180);
    expect(minutes[1]).toBe(430);
  });

  it("T-85: 22:00 a 00:30, a cada 30 → passa da meia-noite (1320 a 1470)", () => {
    expect(ok(frequencyMinutes({ fromMinute: 1320, toMinute: 30, headwayMinutes: 30 }))).toEqual([
      1320, 1350, 1380, 1410, 1440, 1470,
    ]);
  });

  it("intervalo de 1 minuto", () => {
    expect(ok(frequencyMinutes({ fromMinute: 600, toMinute: 605, headwayMinutes: 1 }))).toEqual([600, 601, 602, 603, 604, 605]);
  });

  it("intervalo maior que o período → 1 saída", () => {
    expect(ok(frequencyMinutes({ fromMinute: 600, toMinute: 610, headwayMinutes: 60 }))).toEqual([600]);
  });

  it("o extremo que não cai no passo não entra: 06:40 a 19:50 a cada 30 → última 1180", () => {
    const minutes = ok(frequencyMinutes({ fromMinute: 400, toMinute: 1190, headwayMinutes: 30 }));
    expect(minutes[minutes.length - 1]).toBe(1180);
  });

  it("recusa mais de 300 saídas", () => {
    expect(MAX_FREQUENCY_TRIPS).toBe(300);
    expect(ok(frequencyMinutes({ fromMinute: 0, toMinute: 299, headwayMinutes: 1 }))).toHaveLength(300);
    expect(frequencyMinutes({ fromMinute: 0, toMinute: 300, headwayMinutes: 1 })).toEqual({ ok: false, reason: "too_many" });
  });

  it("recusa intervalo inválido", () => {
    for (const headwayMinutes of [0, -5, 2.5, Number.NaN]) {
      expect(frequencyMinutes({ fromMinute: 400, toMinute: 500, headwayMinutes })).toEqual({ ok: false, reason: "invalid_headway" });
    }
  });

  it("recusa minuto fora de 0 a 1439", () => {
    expect(frequencyMinutes({ fromMinute: -1, toMinute: 500, headwayMinutes: 30 })).toEqual({ ok: false, reason: "invalid_range" });
    expect(frequencyMinutes({ fromMinute: 400, toMinute: 1440, headwayMinutes: 30 })).toEqual({ ok: false, reason: "invalid_range" });
    expect(frequencyMinutes({ fromMinute: 400.5, toMinute: 500, headwayMinutes: 30 })).toEqual({ ok: false, reason: "invalid_range" });
  });
});

describe("departureMinutesFromClock", () => {
  it("hora de madrugada vira 1440 a 1679, ordena e tira repetidos", () => {
    expect(
      departureMinutesFromClock([
        { hour: 1, minute: 10 },
        { hour: 7, minute: 5 },
        { hour: 7, minute: 5 },
        { hour: 3, minute: 59 },
        { hour: 4, minute: 0 },
      ]),
    ).toEqual([240, 425, 1510, 1679]);
  });
});

describe("firstStopMinute", () => {
  it("referência na 1ª paragem devolve a própria referência", () => {
    expect(firstStopMinute(400, 20, 3, 1)).toBe(400);
  });

  it("referência na 2ª de 3 paragens, viagem de 20 min: sai 10 min antes", () => {
    expect(firstStopMinute(410, 20, 3, 2)).toBe(400);
  });

  it("arredonda ao minuto inteiro", () => {
    expect(firstStopMinute(410, 25, 4, 2)).toBe(402); // 410 - 25/3 = 401,67
  });
});

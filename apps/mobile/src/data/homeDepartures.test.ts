import { describe, expect, it } from "vitest";
import { departureData } from "../notifications/payload";
import type { NotificationData, PresentedNotification, ScheduledRequest } from "../notifications/port";
import { departuresFromNotifications } from "./homeDepartures";

describe("homeDepartures (Item 2, D-207, ideia 50)", () => {
  const BASE_NOW = 1_700_000_000_000;

  function makeScheduled(
    id: string,
    overrides: {
      eventId?: string;
      beAtStopAt?: number;
      busTime?: string;
      lineId?: string;
      lineCode?: string;
      stopName?: string;
      placeId?: string;
      test?: boolean;
      customData?: NotificationData;
    } = {},
  ): ScheduledRequest {
    const {
      eventId = id,
      beAtStopAt = BASE_NOW + 5 * 60_000,
      busTime = "08:15",
      lineId = "line-1",
      lineCode = "1",
      stopName = "Arrabalde da Ponte",
      placeId = "place-1",
      test = false,
      customData,
    } = overrides;

    const data =
      customData ??
      departureData({
        eventId,
        stopId: "stop-1",
        lineId,
        tripId: "trip-1",
        beAtStopAt,
        lineCode,
        stopName,
        busTime,
        arriveTime: "08:30",
        placeId,
        test,
      });

    return {
      id,
      at: beAtStopAt - 5 * 60_000,
      title: "Aviso",
      body: "Corpo",
      categoryId: "departure",
      data,
    };
  }

  function makePresented(
    id: string,
    overrides: {
      eventId?: string;
      beAtStopAt?: number;
      busTime?: string;
      lineId?: string;
      lineCode?: string;
      stopName?: string;
      placeId?: string;
      test?: boolean;
      customData?: NotificationData;
      deliveredAt?: number;
    } = {},
  ): PresentedNotification {
    const {
      eventId = id,
      beAtStopAt = BASE_NOW + 5 * 60_000,
      busTime = "08:15",
      lineId = "line-1",
      lineCode = "1",
      stopName = "Arrabalde da Ponte",
      placeId = "place-1",
      test = false,
      customData,
      deliveredAt = BASE_NOW - 60_000,
    } = overrides;

    const data =
      customData ??
      departureData({
        eventId,
        stopId: "stop-1",
        lineId,
        tripId: "trip-1",
        beAtStopAt,
        lineCode,
        stopName,
        busTime,
        arriveTime: "08:30",
        placeId,
        test,
      });

    return {
      id,
      deliveredAt,
      data,
    };
  }

  it("agendado simples lido com sucesso e busAt calculado", () => {
    // 2026-11-15 08:00 UTC (WET, UTC+0 -> Lisboa 08:00)
    // beAtStopAt = 1794729600000 (08:00), busTime = "08:10" (minuto 490 vs minuto 480) -> +10 min
    const beAtStopAt = Date.UTC(2026, 10, 15, 8, 0, 0); // 1794729600000
    const now = beAtStopAt - 15 * 60_000;
    const req = makeScheduled("evt-1", { beAtStopAt, busTime: "08:10" });

    const result = departuresFromNotifications({
      scheduled: [req],
      presented: [],
      now,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      lineId: "line-1",
      lineCode: "1",
      stopName: "Arrabalde da Ponte",
      placeId: "place-1",
      beAtStopAt,
      busAt: beAtStopAt + 10 * 60_000,
    });
  });

  it("entregue simples lido com sucesso", () => {
    const beAtStopAt = Date.UTC(2026, 10, 15, 8, 0, 0);
    const now = beAtStopAt + 2 * 60_000; // já passou o beAtStopAt, mas antes do ônibus
    const pres = makePresented("evt-pres-1", { beAtStopAt, busTime: "08:10" });

    const result = departuresFromNotifications({
      scheduled: [],
      presented: [pres],
      now,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.busAt).toBe(beAtStopAt + 10 * 60_000);
  });

  it("o mesmo eventId nos dois conjuntos vira um só e mantém o de menor busAt", () => {
    const beAtStopAt = Date.UTC(2026, 10, 15, 8, 0, 0);
    const now = beAtStopAt - 30 * 60_000;
    // Agendado para as 08:15 (busAt = beAtStopAt + 15 min)
    const req = makeScheduled("evt-same", { eventId: "shared-event", beAtStopAt, busTime: "08:15" });
    // Entregue do mesmo evento para as 08:10 (busAt = beAtStopAt + 10 min)
    const pres = makePresented("evt-same-pres", { eventId: "shared-event", beAtStopAt, busTime: "08:10" });

    const result = departuresFromNotifications({
      scheduled: [req],
      presented: [pres],
      now,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.busAt).toBe(beAtStopAt + 10 * 60_000);
  });

  it("aviso de teste descartado (id com test: ou payload.test === true)", () => {
    const beAtStopAt = Date.UTC(2026, 10, 15, 8, 0, 0);
    const now = beAtStopAt - 30 * 60_000;
    const reqTestId = makeScheduled("test:12345", { beAtStopAt, busTime: "08:10" });
    const reqTestFlag = makeScheduled("evt-test-flag", { beAtStopAt, busTime: "08:10", test: true });
    const presTest = makePresented("test:pres", { beAtStopAt, busTime: "08:10" });

    const result = departuresFromNotifications({
      scheduled: [reqTestId, reqTestFlag],
      presented: [presTest],
      now,
    });

    expect(result).toEqual([]);
  });

  it("data ilegível (não é departure ou campos obrigatórios faltando) é descartado", () => {
    const beAtStopAt = Date.UTC(2026, 10, 15, 8, 0, 0);
    const now = beAtStopAt - 30 * 60_000;
    const reqMalformedData = makeScheduled("evt-bad", {
      customData: { kind: "other", foo: "bar" },
    });

    const result = departuresFromNotifications({
      scheduled: [reqMalformedData],
      presented: [],
      now,
    });

    expect(result).toEqual([]);
  });

  it("busTime malformado descartado", () => {
    const beAtStopAt = Date.UTC(2026, 10, 15, 8, 0, 0);
    const now = beAtStopAt - 30 * 60_000;

    const badTimes = ["25:00", "08:60", "8:15", "08:5", "ab:cd", "08-15"];
    for (const bt of badTimes) {
      const req = makeScheduled(`evt-${bt}`, { beAtStopAt, busTime: bt });
      const result = departuresFromNotifications({
        scheduled: [req],
        presented: [],
        now,
      });
      expect(result).toEqual([]);
    }
  });

  it("virada da meia-noite: beAtStopAt às 23:50 de Lisboa e busTime '00:05' resulta em busAt 15 min depois", () => {
    // 15 de novembro de 2026: horário WET em Lisboa (UTC+0, sem horário de verão).
    // beAtStopAt = Date.UTC(2026, 10, 15, 23, 50, 0) = 1_794_786_600_000 (23:50 em Lisboa).
    // Minuto de parede em Lisboa às 23:50: 23 * 60 + 50 = 1430.
    // busTime: "00:05", minuto do ônibus: 0 * 60 + 5 = 5.
    // Diferença em minutos com módulo 1440: (5 - 1430 + 1440) % 1440 = 15 minutos.
    // busAt = beAtStopAt + 15 * 60_000 = 1_794_786_600_000 + 900_000 = 1_794_787_500_000.
    const beAtStopAt = 1_794_786_600_000; // 2026-11-15T23:50:00.000Z
    const expectedBusAt = 1_794_787_500_000; // 2026-11-16T00:05:00.000Z
    const now = beAtStopAt - 10 * 60_000; // 23:40

    const req = makeScheduled("evt-midnight", { beAtStopAt, busTime: "00:05" });
    const result = departuresFromNotifications({
      scheduled: [req],
      presented: [],
      now,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.beAtStopAt).toBe(beAtStopAt);
    expect(result[0]?.busAt).toBe(expectedBusAt);
    expect(result[0]!.busAt - result[0]!.beAtStopAt).toBe(15 * 60_000);
  });

  it("ônibus passado (busAt <= now) é descartado", () => {
    const beAtStopAt = Date.UTC(2026, 10, 15, 8, 0, 0);
    // busAt = 08:10
    const busAt = beAtStopAt + 10 * 60_000;
    const req = makeScheduled("evt-passed", { beAtStopAt, busTime: "08:10" });

    // now exatamente igual ao busAt -> descartado
    const resExact = departuresFromNotifications({
      scheduled: [req],
      presented: [],
      now: busAt,
    });
    expect(resExact).toEqual([]);

    // now após busAt -> descartado
    const resAfter = departuresFromNotifications({
      scheduled: [req],
      presented: [],
      now: busAt + 1_000,
    });
    expect(resAfter).toEqual([]);
  });

  it("ordenação crescente por busAt", () => {
    const beAtStopAt = Date.UTC(2026, 10, 15, 8, 0, 0);
    const now = beAtStopAt - 30 * 60_000;

    const reqLate = makeScheduled("evt-late", { lineCode: "2", beAtStopAt, busTime: "08:25" });
    const presEarly = makePresented("evt-early", { lineCode: "1", beAtStopAt, busTime: "08:05" });
    const reqMid = makeScheduled("evt-mid", { lineCode: "3", beAtStopAt, busTime: "08:15" });

    const result = departuresFromNotifications({
      scheduled: [reqLate, reqMid],
      presented: [presEarly],
      now,
    });

    expect(result.map((d) => d.lineCode)).toEqual(["1", "3", "2"]);
    expect(result[0]!.busAt).toBeLessThan(result[1]!.busAt);
    expect(result[1]!.busAt).toBeLessThan(result[2]!.busAt);
  });
});

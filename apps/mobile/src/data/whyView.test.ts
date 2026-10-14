/// <reference types="node" />
import {
  type PassageRecord,
  baseTimeAt,
  displayCenter,
  officialId,
  passageInfo,
  timepointPositions,
} from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { t } from "../i18n";
import { buildAhead } from "./ahead";
import { learnedFixture, learnedStopId, learnedTripIdOf } from "./learnedFixture";
import { passageTarget } from "./records";
import { lisbon } from "./registroFixture";
import type { ScheduleSnapshot } from "./schedule";
import { clockText } from "./stopCard";
import { buildStopDay } from "./stopDay";
import { rowTimeText } from "./stopDayText";
import { buildWhy } from "./whyView";

describe("buildWhy (Item 2)", () => {
  it("sem registros: 3 linhas (sem 'Última'), why.typical.none com 2 min para base oficial e 4 para interpolada", async () => {
    const { data } = await learnedFixture();
    const wednesdayNow = lisbon("2026-10-07", "10:00");
    const tripId = learnedTripIdOf("1", "0810");

    // Posição 1: base oficial (timepoint)
    const whyOfficial = buildWhy({
      tripId,
      position: 1,
      data,
      records: [],
      now: wednesdayNow,
      serviceDay: { date: "2026-10-07", dayType: "weekday" },
    });
    expect(whyOfficial).not.toBeNull();
    expect(whyOfficial!.last).toBeNull();
    expect(whyOfficial!.typical.value).toBe("~08:10");
    expect(whyOfficial!.typical.range).toBeNull();
    expect(whyOfficial!.typical.confidence).toBeNull();
    expect(whyOfficial!.typical.detail).toBe(
      "Ainda sem anotações: vale a tabela, com 2 min de folga para cada lado.",
    );
    expect(whyOfficial!.table.value).toBe("08:10");
    expect(whyOfficial!.table.detail).toBe("Horário da MOBILIS neste ponto");
    expect(whyOfficial!.count.value).toBe("0");
    expect(whyOfficial!.count.level).toBe("none");

    // Posição 3: base interpolada (Estádio Fictício, entre 2: 492 e 5: 524)
    const whyInterpolated = buildWhy({
      tripId,
      position: 3,
      data,
      records: [],
      now: wednesdayNow,
      serviceDay: { date: "2026-10-07", dayType: "weekday" },
    });
    expect(whyInterpolated).not.toBeNull();
    expect(whyInterpolated!.last).toBeNull();
    expect(whyInterpolated!.typical.value).toBe("~08:23");
    expect(whyInterpolated!.typical.detail).toBe(
      "Ainda sem anotações: vale a tabela, com 4 min de folga para cada lado.",
    );
    expect(whyInterpolated!.table.value).toBe("~08:23");
    expect(whyInterpolated!.table.detail).toMatch(/^Calculado pela tabela: /);
  });

  it("4 registros auto de +6 nesta viagem: nível trip, contagem 4, Costuma passar = base + 6 e igual ao buildStopDay e buildAhead (regra de ouro 2)", async () => {
    const { data } = await learnedFixture();
    const wednesdayNow = lisbon("2026-10-07", "08:00");
    const tripId = learnedTripIdOf("1", "0810");
    const target = passageTarget(data, tripId, 1, "2026-10-07", "weekday")!;

    // 4 registros com desvio +6
    const records: PassageRecord[] = [1, 2, 3, 4].map((d) => ({
      deviation: 6,
      observedAt: wednesdayNow - d * 86_400_000,
      serviceDate: `2026-10-0${d}`,
      dayType: "weekday",
      tripId: target.tripId,
      patternId: target.patternId,
      position: target.position,
      stopId: target.stopId,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    }));

    const why = buildWhy({
      tripId,
      position: 1,
      data,
      records,
      now: wednesdayNow,
      serviceDay: { date: "2026-10-07", dayType: "weekday" },
    })!;

    expect(why).not.toBeNull();
    expect(why.count.level).toBe("trip");
    expect(why.count.count).toBe(4);
    expect(why.typical.value).toBe("~08:16"); // base 08:10 + 6

    // Regra de ouro 2: igual ao here.time de buildAhead
    const ahead = buildAhead(tripId, 1, data, {
      learning: { records, now: wednesdayNow, serviceDay: { date: "2026-10-07", dayType: "weekday" } },
    })!;
    expect(why.typical.value).toBe(rowTimeText({ time: ahead.here.time }));

    // Regra de ouro 2: igual ao horário na lista do Ponto (buildStopDay)
    const stopDay = buildStopDay(target.stopId, data, wednesdayNow, "weekday", records)!;
    const line = stopDay.lines.find((l) => l.code === "1")!;
    const passage = line.rows.find((p) => p.tripId === tripId && p.position === 1)!;
    expect(why.typical.value).toBe(rowTimeText(passage));

    // Linha 4 (Última) está presente com 4 registros
    expect(why.last).not.toBeNull();
  });

  it("registro só de outra viagem do mesmo ponto: nível stop, Última com ' · viagem das HH:MM'", async () => {
    const { data } = await learnedFixture();
    const wednesdayNow = lisbon("2026-10-07", "10:00");
    const trip0810 = learnedTripIdOf("1", "0810");
    const trip0840 = learnedTripIdOf("1", "0840");
    const target0810 = passageTarget(data, trip0810, 1, "2026-10-07", "weekday")!;

    // Registro na viagem das 08:10 no ponto 1
    const records: PassageRecord[] = [
      {
        deviation: 4,
        observedAt: wednesdayNow - 86_400_000,
        serviceDate: "2026-10-06",
        dayType: "weekday",
        tripId: trip0810,
        patternId: target0810.patternId,
        position: 1,
        stopId: target0810.stopId,
        matchStatus: "auto",
        mode: "live",
        kind: "boarded",
      },
    ];

    // Consulta para a viagem das 08:40 no mesmo ponto (posição 1)
    const why = buildWhy({
      tripId: trip0840,
      position: 1,
      data,
      records,
      now: wednesdayNow,
      serviceDay: { date: "2026-10-07", dayType: "weekday" },
    })!;

    expect(why).not.toBeNull();
    expect(why.count.level).toBe("stop");
    expect(why.last).not.toBeNull();
    expect(why.last!.detail).toContain(" · viagem das 08:10");
  });

  it("registro ambiguous mais recente que o aceito: Última é a do aceito", async () => {
    const { data } = await learnedFixture();
    const wednesdayNow = lisbon("2026-10-07", "10:00");
    const tripId = learnedTripIdOf("1", "0810");
    const target = passageTarget(data, tripId, 1, "2026-10-07", "weekday")!;

    const acceptedRecord: PassageRecord = {
      deviation: 5,
      observedAt: wednesdayNow - 2 * 86_400_000, // 2 dias atrás
      serviceDate: "2026-10-05",
      dayType: "weekday",
      tripId: target.tripId,
      patternId: target.patternId,
      position: target.position,
      stopId: target.stopId,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    };

    const ambiguousRecord: PassageRecord = {
      deviation: 15,
      observedAt: wednesdayNow - 86_400_000, // 1 dia atrás (mais recente!)
      serviceDate: "2026-10-06",
      dayType: "weekday",
      tripId: target.tripId,
      patternId: target.patternId,
      position: target.position,
      stopId: target.stopId,
      matchStatus: "ambiguous",
      mode: "live",
      kind: "boarded",
    };

    const why = buildWhy({
      tripId,
      position: 1,
      data,
      records: [acceptedRecord, ambiguousRecord],
      now: wednesdayNow,
      serviceDay: { date: "2026-10-07", dayType: "weekday" },
    })!;

    expect(why.last).not.toBeNull();
    // A última é a do aceito (05/10), não a do ambiguous (06/10)
    expect(why.last!.detail).toContain("05/10");
    expect(why.last!.detail).toContain("5 min depois da tabela");
  });

  it("linha source: 'user' → why.table.user_line; official_edited → why.table.official (2e)", async () => {
    const { data } = await learnedFixture();
    const wednesdayNow = lisbon("2026-10-07", "10:00");
    const tripId = learnedTripIdOf("1", "0810");
    const trip = data.trips.find((t) => t.id === tripId)!;

    // Snapshot com linha do usuário
    const userData: ScheduleSnapshot = {
      ...data,
      patternLine: new Map(data.patternLine),
    };
    userData.patternLine.set(trip.patternId, {
      code: "1",
      color: "#000",
      source: "user",
    });

    const whyUser = buildWhy({
      tripId,
      position: 1,
      data: userData,
      records: [],
      now: wednesdayNow,
      serviceDay: { date: "2026-10-07", dayType: "weekday" },
    })!;
    expect(whyUser.table.detail).toBe("Horário que você cadastrou na linha");

    // Snapshot com linha official_edited
    const editedData: ScheduleSnapshot = {
      ...data,
      patternLine: new Map(data.patternLine),
    };
    editedData.patternLine.set(trip.patternId, {
      code: "1",
      color: "#000",
      source: "official_edited",
    });

    const whyEdited = buildWhy({
      tripId,
      position: 1,
      data: editedData,
      records: [],
      now: wednesdayNow,
      serviceDay: { date: "2026-10-07", dayType: "weekday" },
    })!;
    expect(whyEdited.table.detail).toBe("Horário da MOBILIS neste ponto");
  });

  it("desvio −2 → why.delta.early '2 min antes da tabela'; desvio +0,4 → why.delta.on_time (2c)", async () => {
    const { data } = await learnedFixture();
    const wednesdayNow = lisbon("2026-10-07", "10:00");
    const tripId = learnedTripIdOf("1", "0810");
    const target = passageTarget(data, tripId, 1, "2026-10-07", "weekday")!;

    // Desvio -2
    const recordEarly: PassageRecord = {
      deviation: -2,
      observedAt: wednesdayNow - 86_400_000,
      serviceDate: "2026-10-06",
      dayType: "weekday",
      tripId: target.tripId,
      patternId: target.patternId,
      position: target.position,
      stopId: target.stopId,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    };

    const whyEarly = buildWhy({
      tripId,
      position: 1,
      data,
      records: [recordEarly],
      now: wednesdayNow,
      serviceDay: { date: "2026-10-07", dayType: "weekday" },
    })!;
    expect(whyEarly.last!.detail).toContain("2 min antes da tabela");

    // Desvio +0.4 -> Math.round(+0.4) === 0 -> na hora da tabela
    const recordOnTime: PassageRecord = {
      deviation: 0.4,
      observedAt: wednesdayNow - 86_400_000,
      serviceDate: "2026-10-06",
      dayType: "weekday",
      tripId: target.tripId,
      patternId: target.patternId,
      position: target.position,
      stopId: target.stopId,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    };

    const whyOnTime = buildWhy({
      tripId,
      position: 1,
      data,
      records: [recordOnTime],
      now: wednesdayNow,
      serviceDay: { date: "2026-10-07", dayType: "weekday" },
    })!;
    expect(whyOnTime.last!.detail).toContain("na hora da tabela");
  });

  it("respeita serviceDay.dayType quando a data é quarta mas o chip é sábado (2a)", async () => {
    const { data } = await learnedFixture();
    const wednesdayNow = lisbon("2026-10-07", "10:00");
    const satTripId = learnedTripIdOf("1", "0810_sat");
    const targetSat = passageTarget(data, satTripId, 1, "2026-10-07", "saturday")!;

    // 4 registros de sábado com desvio +6
    const satRecords: PassageRecord[] = [1, 2, 3, 4].map((d) => ({
      deviation: 6,
      observedAt: wednesdayNow - d * 86_400_000,
      serviceDate: `2026-10-0${d}`,
      dayType: "saturday",
      tripId: targetSat.tripId,
      patternId: targetSat.patternId,
      position: targetSat.position,
      stopId: targetSat.stopId,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    }));

    // Com serviceDay.dayType: saturday, aprende (+6)
    const whySat = buildWhy({
      tripId: satTripId,
      position: 1,
      data,
      records: satRecords,
      now: wednesdayNow,
      serviceDay: { date: "2026-10-07", dayType: "saturday" },
    })!;
    expect(whySat.typical.value).toBe("~08:16");

    // Com serviceDay.dayType: weekday, NÃO aprende os registros de sábado -> base ~08:10
    const whyWeekday = buildWhy({
      tripId: satTripId,
      position: 1,
      data,
      records: satRecords,
      now: wednesdayNow,
      serviceDay: { date: "2026-10-07", dayType: "weekday" },
    })!;
    expect(whyWeekday.typical.value).toBe("~08:10");
  });

  it("last vem do nível usado (trip) e não do nível acima (stop) (2d)", async () => {
    const { data } = await learnedFixture();
    const wednesdayNow = lisbon("2026-10-07", "10:00");
    const trip0810 = learnedTripIdOf("1", "0810");
    const trip0840 = learnedTripIdOf("1", "0840");
    const target = passageTarget(data, trip0810, 1, "2026-10-07", "weekday")!;

    // Registro da viagem 0810 feito há 5 dias
    const tripRecord: PassageRecord = {
      deviation: 3,
      observedAt: wednesdayNow - 5 * 86_400_000,
      serviceDate: "2026-10-02",
      dayType: "weekday",
      tripId: trip0810,
      patternId: target.patternId,
      position: 1,
      stopId: target.stopId,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    };

    // Registro da viagem 0840 (mesmo ponto, nível stop) feito há 1 dia
    const stopRecord: PassageRecord = {
      deviation: 8,
      observedAt: wednesdayNow - 86_400_000,
      serviceDate: "2026-10-06",
      dayType: "weekday",
      tripId: trip0840,
      patternId: target.patternId,
      position: 1,
      stopId: target.stopId,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    };

    const why = buildWhy({
      tripId: trip0810,
      position: 1,
      data,
      records: [tripRecord, stopRecord],
      now: wednesdayNow,
      serviceDay: { date: "2026-10-07", dayType: "weekday" },
    })!;

    expect(why.count.level).toBe("trip");
    // Última deve ser a da viagem (02/10, desvio 3), e NÃO a do nível acima (06/10, desvio 8)
    expect(why.last!.detail).toContain("02/10");
    expect(why.last!.detail).toContain("3 min depois da tabela");
  });
});

import { describe, expect, it } from "vitest";
import { dayOfWeek } from "@notebus/domain";
import type { TripData } from "@notebus/domain";
import {
  alarmFromCard,
  alarmLine,
  alarmOfCard,
  alarmSummary,
  applyPreset,
  applyUntil,
  createAskController,
  historyList,
  presetOf,
  repeatPresets,
  sheetOfPendingIntent,
  shouldShowFocusHint,
  toggleWeekday,
  upcomingList,
} from "./alarmsUi";
import type { ScheduledRequest } from "../notifications/port";
import type { AlarmEventRow } from "../db/alarms";

describe("Item 1: alarmsUi - Camada de dados das telas fora do React", () => {
  describe("1. Atalhos do 'Repetir'", () => {
    it("repeatPresets gera once, daily, weekdays, weekly com o dia do domínio", () => {
      // 2026-10-08 é quinta-feira (4 no domínio)
      expect(dayOfWeek("2026-10-08")).toBe(4);
      const thu = repeatPresets("2026-10-08");
      expect(thu.once).toEqual({ kind: "once", weekdays: [], onceDate: "2026-10-08" });
      expect(thu.daily).toEqual({ kind: "daily", weekdays: [0, 1, 2, 3, 4, 5, 6], onceDate: null });
      expect(thu.weekdays).toEqual({ kind: "weekdays", weekdays: [1, 2, 3, 4, 5], onceDate: null });
      expect(thu.weekly).toEqual({ kind: "weekly", weekdays: [4], onceDate: null });

      // 2026-10-12 é segunda-feira (1 no domínio)
      expect(dayOfWeek("2026-10-12")).toBe(1);
      const mon = repeatPresets("2026-10-12");
      expect(mon.weekly).toEqual({ kind: "weekly", weekdays: [1], onceDate: null });
    });

    it("presetOf identifica cada atalho e devolve custom para os demais", () => {
      expect(presetOf([], "2026-10-08")).toBe("once");
      expect(presetOf([0, 1, 2, 3, 4, 5, 6], null)).toBe("daily");
      expect(presetOf([1, 2, 3, 4, 5], null)).toBe("weekdays");
      expect(presetOf([4], null, "2026-10-08")).toBe("weekly");
      expect(presetOf([1], null, "2026-10-12")).toBe("weekly");

      // Conjuntos customizados
      expect(presetOf([1, 3, 5], null)).toBe("custom");
      expect(presetOf([1], null, "2026-10-08")).toBe("custom"); // segunda não é o dia da saída da quinta
    });
  });

  describe("2. Resumo do aviso (alarmSummary) e linha de Ajustes (alarmLine)", () => {
    it("alarmSummary formata só hoje, todo dia, seg a sex e dias abreviados em ordem seg-dom", () => {
      expect(alarmSummary([], null)).toBe("só hoje");
      expect(alarmSummary([0, 1, 2, 3, 4, 5, 6], null)).toBe("todo dia");
      expect(alarmSummary([1, 2, 3, 4, 5], null)).toBe("seg a sex");
      // [5, 1, 3] deve sair na ordem seg qua sex
      expect(alarmSummary([5, 1, 3], null)).toBe("seg qua sex");
      // com validTo
      expect(alarmSummary([5, 1, 3], "2027-01-31")).toBe("seg qua sex · até 31/01");
      expect(alarmSummary([], "2026-10-08")).toBe("só hoje");
    });

    it("alarmLine monta o resumo completo para a lista de Ajustes", () => {
      const line = alarmLine(
        { weekdays: [1, 3, 5], validTo: "2027-01-31" },
        { placeName: "Facul", lineCode: "L1", leaveTime: "07:59" },
      );
      expect(line).toBe("Facul · L1 · sair ~07:59 · seg qua sex · até 31/01");
    });
  });

  describe("3. Montar o aviso a partir do cartão (alarmFromCard)", () => {
    it("monta NewAlarm com anchorBaseMinute do baseTimeAt e onceDate da data de serviço", () => {
      const trip: TripData = {
        id: "trip-1",
        patternId: "patt-1",
        firstPosition: 1,
        lastPosition: 5,
        stopTimes: [
          { position: 1, serviceMinute: 480, origin: "official" },
          { position: 3, serviceMinute: 495, origin: "official" },
        ],
      };
      const alarm = alarmFromCard({ optionId: "opt-1", tripId: "trip-1" }, trip, 1, "2026-10-08");
      expect(alarm).toEqual({
        optionId: "opt-1",
        anchorTripId: "trip-1",
        anchorBaseMinute: 480,
        validFrom: "2026-10-08",
        validTo: null,
        enabled: true,
        weekdays: [],
        onceDate: "2026-10-08",
      });
    });
  });

  describe("4. O cartão tem aviso? (alarmOfCard)", () => {
    it("dois cartões de opções diferentes com a mesma base: um tem aviso, o outro não", () => {
      const trip: TripData = {
        id: "trip-1",
        patternId: "patt-1",
        firstPosition: 1,
        lastPosition: 5,
        stopTimes: [{ position: 1, serviceMinute: 480, origin: "official" }],
      };
      const alarms = [
        {
          id: "alarm-1",
          optionId: "opt-1",
          anchorTripId: "trip-1",
          anchorBaseMinute: 480,
          enabled: true,
          weekdays: [1, 2, 3, 4, 5],
          onceDate: null,
          validFrom: "2026-10-08",
          validTo: null,
        },
      ];

      const card1 = { optionId: "opt-1", tripId: "trip-1" };
      const card2 = { optionId: "opt-2", tripId: "trip-1" };

      expect(alarmOfCard(card1, alarms, trip, 1)).toBeDefined();
      expect(alarmOfCard(card1, alarms, trip, 1)?.id).toBe("alarm-1");

      expect(alarmOfCard(card2, alarms, trip, 1)).toBeUndefined();
    });

    it("aviso da mesma opção mas com horário-base diferente não conta", () => {
      const trip: TripData = {
        id: "trip-2",
        patternId: "patt-1",
        firstPosition: 1,
        lastPosition: 5,
        stopTimes: [{ position: 1, serviceMinute: 540, origin: "official" }],
      };
      const alarms = [
        {
          id: "alarm-1",
          optionId: "opt-1",
          anchorTripId: "trip-1",
          anchorBaseMinute: 480,
          enabled: true,
          weekdays: [],
          onceDate: "2026-10-08",
          validFrom: "2026-10-08",
          validTo: null,
        },
      ];
      expect(alarmOfCard({ optionId: "opt-1", tripId: "trip-2" }, alarms, trip, 1)).toBeUndefined();
    });
  });

  describe("5. Próximos avisos (upcomingList)", () => {
    it("filtra por categoria departure, ignora teste e adiar, ordena por hora e limita a 10", () => {
      const scheduled: ScheduledRequest[] = [
        {
          id: "alarm-1:2026-10-08",
          at: 1000000,
          title: "Aviso",
          body: "Corpo",
          categoryId: "departure",
          data: { kind: "departure", lineCode: "L1", stopName: "Arrabalde", test: false },
        },
        {
          id: "alarm-2:2026-10-08",
          at: 900000,
          title: "Aviso",
          body: "Corpo",
          categoryId: "departure",
          data: { kind: "departure", lineCode: "L2", stopName: "Praça", test: false },
        },
        // Alarme de teste deve ser ignorado
        {
          id: "test:1050000",
          at: 1050000,
          title: "Teste",
          body: "Corpo",
          categoryId: "departure",
          data: { kind: "departure", lineCode: "L1", stopName: "Arrabalde", test: true },
        },
        // Alarme de adiar (:snooze) deve ser ignorado
        {
          id: "alarm-1:2026-10-08:snooze",
          at: 950000,
          title: "Adiado",
          body: "Corpo",
          categoryId: "departure",
          data: { kind: "departure", lineCode: "L1", stopName: "Arrabalde", test: false },
        },
        // Categoria diferente deve ser ignorada
        {
          id: "other",
          at: 800000,
          title: "Outro",
          body: "Corpo",
          categoryId: "confirm",
          data: { kind: "confirm" },
        },
      ];

      const list = upcomingList(scheduled);
      expect(list).toHaveLength(2);
      expect(list[0]!.id).toBe("alarm-2:2026-10-08");
      expect(list[0]!.text).toBe("L2 · Praça");
      expect(list[1]!.id).toBe("alarm-1:2026-10-08");
      expect(list[1]!.text).toBe("L1 · Arrabalde");
    });
  });

  describe("6. Histórico (historyList)", () => {
    it("ordena mais novos primeiro, no máximo 30, com rótulos honestos", () => {
      const baseRow = {
        source: "user" as const,
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null,
      };
      const events: AlarmEventRow[] = [
        { ...baseRow, id: "e1", alarmId: "a1", serviceDate: "2026-10-06", tripId: "t1", plannedAt: 100, state: "boarded", actedAt: 110, snoozedTo: null, skipReason: null },
        { ...baseRow, id: "e2", alarmId: "a1", serviceDate: "2026-10-07", tripId: "t1", plannedAt: 200, state: "snoozed", actedAt: 210, snoozedTo: 220, skipReason: null },
        { ...baseRow, id: "e3", alarmId: "a1", serviceDate: "2026-10-08", tripId: "t1", plannedAt: 300, state: "dismissed", actedAt: 310, snoozedTo: null, skipReason: null },
        { ...baseRow, id: "e4", alarmId: "a1", serviceDate: "2026-10-09", tripId: "t1", plannedAt: 400, state: "delivered", actedAt: null, snoozedTo: null, skipReason: null },
        { ...baseRow, id: "e5", alarmId: "a1", serviceDate: "2026-10-10", tripId: "t1", plannedAt: 500, state: "unconfirmed", actedAt: null, snoozedTo: null, skipReason: null },
        { ...baseRow, id: "e6", alarmId: "a1", serviceDate: "2026-10-11", tripId: "t1", plannedAt: 600, state: "scheduled", actedAt: null, snoozedTo: null, skipReason: null },
        { ...baseRow, id: "e7", alarmId: "a1", serviceDate: "2026-10-12", tripId: null, plannedAt: 700, state: "skipped", actedAt: null, snoozedTo: null, skipReason: "holiday" },
        { ...baseRow, id: "e8", alarmId: "a1", serviceDate: "2026-10-13", tripId: null, plannedAt: 800, state: "skipped", actedAt: null, snoozedTo: null, skipReason: "no_trip" },
      ];

      const list = historyList(events);
      expect(list).toHaveLength(8);
      // Mais novos primeiro
      expect(list[0]!.id).toBe("e8");
      expect(list[0]!.statusLabel).toBe("Pulado: sem a viagem");
      expect(list[1]!.id).toBe("e7");
      expect(list[1]!.statusLabel).toBe("Pulado: feriado");
      expect(list[2]!.id).toBe("e6");
      expect(list[2]!.statusLabel).toBe("Agendado");
      expect(list[3]!.id).toBe("e5");
      expect(list[3]!.statusLabel).toBe("Sem confirmação");
      expect(list[4]!.id).toBe("e4");
      expect(list[4]!.statusLabel).toBe("Entregue");
      expect(list[5]!.id).toBe("e3");
      expect(list[5]!.statusLabel).toBe("Dispensado");
      expect(list[6]!.id).toBe("e2");
      expect(list[6]!.statusLabel).toBe("Adiado");
      expect(list[7]!.id).toBe("e1");
      expect(list[7]!.statusLabel).toBe("Registrou pelo aviso");
    });
  });

  describe("Item 2 & Item 3: Transições e Intentos", () => {
    it("sheetOfPendingIntent traduz o intento goto em folha", () => {
      expect(sheetOfPendingIntent({ kind: "goto", placeId: "place-123" })).toEqual({
        kind: "goto",
        destinationPlaceId: "place-123",
      });
      expect(sheetOfPendingIntent(null)).toBeNull();
    });

    it("transições de atalhos e desmarcar todos os chips volta a once", () => {
      expect(applyPreset("once", "2026-10-08")).toEqual({
        weekdays: [],
        onceDate: "2026-10-08",
      });
      expect(applyPreset("daily", "2026-10-08")).toEqual({
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        onceDate: null,
      });
      expect(applyPreset("weekdays", "2026-10-08")).toEqual({
        weekdays: [1, 2, 3, 4, 5],
        onceDate: null,
      });
      expect(applyPreset("weekly", "2026-10-08")).toEqual({
        weekdays: [4],
        onceDate: null,
      });

      // Seletor "Até": "Sem fim" grava null, "Uma data" grava a data
      expect(applyUntil("none", "2027-01-31")).toBeNull();
      expect(applyUntil("date", "2027-01-31")).toBe("2027-01-31");
      expect(applyUntil("date", null)).toBeNull();

      // Alternar dias: desmarcar o último chip volta a once com a data de serviço
      const oneDay = [4];
      const none = toggleWeekday(oneDay, 4, "2026-10-08");
      expect(none).toEqual({ weekdays: [], onceDate: "2026-10-08" });

      const addDay = toggleWeekday([], 1, "2026-10-08");
      expect(addDay).toEqual({ weekdays: [1], onceDate: null });
    });

    it("shouldShowFocusHint exibe apenas se a flag não foi gravada", () => {
      expect(shouldShowFocusHint(false)).toBe(true);
      expect(shouldShowFocusHint(null)).toBe(true);
      expect(shouldShowFocusHint(undefined)).toBe(true);
      expect(shouldShowFocusHint(true)).toBe(false);
    });

    it("createAskController resolve apenas uma vez e nunca pendura", async () => {
      const ask = createAskController();
      let resolvedValue: boolean | undefined;
      const promise = ask.wait().then((v) => (resolvedValue = v));

      ask.resolve(true);
      await promise;
      expect(resolvedValue).toBe(true);

      // Segunda resolução é no-op
      ask.resolve(false);
      expect(resolvedValue).toBe(true);
    });
  });
});

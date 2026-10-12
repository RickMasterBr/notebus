/// <reference types="node" />
import { officialId } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { createLine } from "../db/lineCreate";
import { type ImportDb, importMobilis } from "../db/importMobilis";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { lineSeed } from "../db/testing/lineSeed";
import { validateLineDraft } from "./lineDraft";
import {
  LINE_COLORS,
  NEW_LINE_ID,
  addDeparture,
  addStop,
  buildLineDraft,
  initialLineFormState,
  lineFormView,
  lineRefusalText,
  moveStop,
  removeDeparture,
  removeStop,
  applyPickedTime,
  pickerInitialMinute,
  setMode,
  toggleDayType,
  submitLineForm,
  type LineFormRefusalReason,
  type LineFormState,
} from "./lineForm";

const S = officialId("mobilis/stop/S");
const A = officialId("mobilis/stop/A");
const K = officialId("mobilis/stop/K");

const NAMES = {
  S: "Estação Inventada",
  A: "Arrabalde Inventado",
  K: "Campus Exemplo",
};

const seed = () =>
  lineSeed(NAMES, [
    {
      code: "1",
      color: "#7CB342",
      stops: [{ stop: "S", timepoint: true }, { stop: "A" }, { stop: "K", timepoint: true }],
      trips: [{ id: "0810", days: ["weekday", "saturday"], times: { 1: 490, 3: 520 } }],
    },
  ]);

async function setupTestDb() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(raw, seed());
  return { db };
}

describe("E-08 bloco 11 Item 0: regras puras de lineForm", () => {
  it("1: NEW_LINE_ID é '__new__'", () => {
    expect(NEW_LINE_ID).toBe("__new__");
  });

  it("2: LINE_COLORS tem 8 cores hex válidas, sem repetição, a primeira é o padrão", () => {
    expect(LINE_COLORS).toHaveLength(8);
    expect(new Set(LINE_COLORS).size).toBe(8);
    expect(LINE_COLORS[0]).toBe("#5B4BD6");
    for (const color of LINE_COLORS) {
      expect(/^#[0-9A-Fa-f]{6}$/.test(color)).toBe(true);
    }
  });

  describe("buildLineDraft", () => {
    const baseState: LineFormState = {
      code: "99",
      name: "Teste 99",
      color: LINE_COLORS[0],
      patternLabel: "Ida",
      isCircular: false,
      stops: [
        { id: S, name: NAMES.S },
        { id: A, name: NAMES.A },
      ],
      durationText: "25",
      dayTypeCodes: ["weekday"],
      mode: "departures",
      departures: [{ hour: 8, minute: 30 }],
      frequency: {
        fromMinute: 360,
        toMinute: 1200,
        headwayMinutes: 30,
      },
    };

    it("em modo departures envia departures e frequency fica ausente", () => {
      const draft = buildLineDraft({ ...baseState, mode: "departures" });
      expect(draft.departures).toEqual([{ hour: 8, minute: 30 }]);
      expect(draft.frequency).toBeUndefined();
    });

    it("em modo frequency envia frequency e departures fica ausente", () => {
      const draft = buildLineDraft({ ...baseState, mode: "frequency" });
      expect(draft.frequency).toEqual({
        fromMinute: 360,
        toMinute: 1200,
        headwayMinutes: 30,
      });
      expect(draft.departures).toBeUndefined();
    });

    it("converte durationText inteiro para número e não inteiro para NaN", () => {
      const valid = buildLineDraft({ ...baseState, durationText: " 42 " });
      expect(valid.durationMinutes).toBe(42);

      const invalidLetter = buildLineDraft({ ...baseState, durationText: "42a" });
      expect(Number.isNaN(invalidLetter.durationMinutes)).toBe(true);

      const invalidDecimal = buildLineDraft({ ...baseState, durationText: "42.5" });
      expect(Number.isNaN(invalidDecimal.durationMinutes)).toBe(true);

      const invalidEmpty = buildLineDraft({ ...baseState, durationText: "" });
      expect(Number.isNaN(invalidEmpty.durationMinutes)).toBe(true);
    });
  });

  describe("addDeparture e removeDeparture", () => {
    it("adiciona sem repetir e ordena a madrugada (00:00 a 03:59) depois da noite (23:59)", () => {
      let list = addDeparture([], { hour: 23, minute: 30 });
      list = addDeparture(list, { hour: 0, minute: 15 });
      list = addDeparture(list, { hour: 8, minute: 0 });
      list = addDeparture(list, { hour: 3, minute: 45 });
      list = addDeparture(list, { hour: 4, minute: 0 });

      // Ordem esperada de relógio de serviço:
      // 04:00 (240), 08:00 (480), 23:30 (1410), 00:15 (1455), 03:45 (1665)
      expect(list).toEqual([
        { hour: 4, minute: 0 },
        { hour: 8, minute: 0 },
        { hour: 23, minute: 30 },
        { hour: 0, minute: 15 },
        { hour: 3, minute: 45 },
      ]);

      // Repetido não duplica
      const countBefore = list.length;
      list = addDeparture(list, { hour: 0, minute: 15 });
      expect(list).toHaveLength(countBefore);
    });

    it("removeDeparture remove pelo índice", () => {
      const list = [
        { hour: 8, minute: 0 },
        { hour: 9, minute: 0 },
      ];
      expect(removeDeparture(list, 0)).toEqual([{ hour: 9, minute: 0 }]);
    });
  });

  describe("moveStop, addStop e removeStop", () => {
    const stops = [
      { id: "1", name: "Ponto 1" },
      { id: "2", name: "Ponto 2" },
      { id: "3", name: "Ponto 3" },
    ];

    it("troca de lugar com vizinho para cima e para baixo", () => {
      expect(moveStop(stops, 1, "up")).toEqual([
        { id: "2", name: "Ponto 2" },
        { id: "1", name: "Ponto 1" },
        { id: "3", name: "Ponto 3" },
      ]);
      expect(moveStop(stops, 1, "down")).toEqual([
        { id: "1", name: "Ponto 1" },
        { id: "3", name: "Ponto 3" },
        { id: "2", name: "Ponto 2" },
      ]);
    });

    it("nos extremos devolve a lista igual", () => {
      expect(moveStop(stops, 0, "up")).toEqual(stops);
      expect(moveStop(stops, 2, "down")).toEqual(stops);
    });

    it("addStop acrescenta no fim e removeStop remove pelo índice", () => {
      const added = addStop(stops, { id: "1", name: "Ponto 1" });
      expect(added).toHaveLength(4);
      expect(added[3]).toEqual({ id: "1", name: "Ponto 1" });

      const removed = removeStop(stops, 1);
      expect(removed).toEqual([
        { id: "1", name: "Ponto 1" },
        { id: "3", name: "Ponto 3" },
      ]);
    });
  });

  describe("lineFormView", () => {
    const validState: LineFormState = {
      code: "99",
      name: "Teste 99",
      color: LINE_COLORS[0],
      patternLabel: "Ida",
      isCircular: false,
      stops: [
        { id: S, name: NAMES.S },
        { id: A, name: NAMES.A },
      ],
      durationText: "25",
      dayTypeCodes: ["weekday"],
      mode: "departures",
      departures: [{ hour: 8, minute: 0 }],
      frequency: {
        fromMinute: 360,
        toMinute: 1200,
        headwayMinutes: 30,
      },
    };

    it("canSave é verdadeiro no estado válido", () => {
      expect(lineFormView(validState).canSave).toBe(true);
    });

    it("canSave é falso se o código for vazio ou só espaços", () => {
      expect(lineFormView({ ...validState, code: "" }).canSave).toBe(false);
      expect(lineFormView({ ...validState, code: "   " }).canSave).toBe(false);
    });

    it("canSave é falso se o nome for vazio ou só espaços", () => {
      expect(lineFormView({ ...validState, name: "" }).canSave).toBe(false);
      expect(lineFormView({ ...validState, name: "   " }).canSave).toBe(false);
    });

    it("canSave é falso com menos de 2 paragens", () => {
      expect(lineFormView({ ...validState, stops: [] }).canSave).toBe(false);
      expect(lineFormView({ ...validState, stops: [{ id: S, name: NAMES.S }] }).canSave).toBe(false);
    });

    it("canSave é falso sem tipos de dia", () => {
      expect(lineFormView({ ...validState, dayTypeCodes: [] }).canSave).toBe(false);
    });

    it("canSave é falso sem saídas no modo departures", () => {
      expect(lineFormView({ ...validState, mode: "departures", departures: [] }).canSave).toBe(false);
    });

    it("canSave é falso com headwayMinutes < 1 no modo frequency", () => {
      expect(
        lineFormView({
          ...validState,
          mode: "frequency",
          frequency: { ...validState.frequency, headwayMinutes: 0 },
        }).canSave,
      ).toBe(false);
    });

    it("stopRows calcula canMoveUp e canMoveDown em cada linha", () => {
      const view = lineFormView({
        ...validState,
        stops: [
          { id: "1", name: "P1" },
          { id: "2", name: "P2" },
          { id: "3", name: "P3" },
        ],
      });
      expect(view.stopRows[0]).toMatchObject({ canMoveUp: false, canMoveDown: true, index: 0 });
      expect(view.stopRows[1]).toMatchObject({ canMoveUp: true, canMoveDown: true, index: 1 });
      expect(view.stopRows[2]).toMatchObject({ canMoveUp: true, canMoveDown: false, index: 2 });
    });

    it("showMadrugadaHint em 03:59 liga e em 04:00 desliga", () => {
      // Modo departures
      const viewMadrugada = lineFormView({
        ...validState,
        mode: "departures",
        departures: [{ hour: 3, minute: 59 }],
      });
      expect(viewMadrugada.showMadrugadaHint).toBe(true);

      const viewManha = lineFormView({
        ...validState,
        mode: "departures",
        departures: [{ hour: 4, minute: 0 }],
      });
      expect(viewManha.showMadrugadaHint).toBe(false);

      // Modo frequency (fromMinute: 3:59 = 239, 4:00 = 240)
      const viewFreqMadrugada = lineFormView({
        ...validState,
        mode: "frequency",
        frequency: { fromMinute: 239, toMinute: 600, headwayMinutes: 30 },
      });
      expect(viewFreqMadrugada.showMadrugadaHint).toBe(true);

      const viewFreqManha = lineFormView({
        ...validState,
        mode: "frequency",
        frequency: { fromMinute: 240, toMinute: 600, headwayMinutes: 30 },
      });
      expect(viewFreqManha.showMadrugadaHint).toBe(false);
    });
  });

  describe("lineRefusalText", () => {
    const reasons: LineFormRefusalReason[] = [
      "code_required",
      "code_too_long",
      "name_required",
      "name_too_long",
      "color_invalid",
      "pattern_label_required",
      "pattern_label_too_long",
      "stops_min",
      "duration_invalid",
      "day_types_required",
      "day_type_invalid",
      "times_required",
      "times_conflict",
      "times_invalid",
      "ref_position_invalid",
      "crosses_cutoff",
      "invalid_headway",
      "invalid_range",
      "too_many",
      "invalid",
      "no_network",
      "duplicate_code",
      "unknown_stop",
      "unknown_day_type",
    ];

    it("mapeia todos os motivos para chaves do catálogo e cada motivo tem chave única", () => {
      const keys = new Set<string>();
      for (const reason of reasons) {
        const text = lineRefusalText(reason);
        expect(text.key).toBeDefined();
        expect(typeof text.key).toBe("string");
        expect(keys.has(text.key)).toBe(false);
        keys.add(text.key);
      }
      expect(keys.size).toBe(reasons.length);
    });
  });

  describe("applyPickedTime", () => {
    const baseState = initialLineFormState();

    it("departure adiciona a partida sem tocar em frequency", () => {
      const next = applyPickedTime(baseState, "departure", 8, 30);
      expect(next.departures).toEqual([{ hour: 8, minute: 30 }]);
      expect(next.frequency).toEqual(baseState.frequency);
    });

    it("freqFrom grava fromMinute e não toca em toMinute", () => {
      const custom = {
        ...baseState,
        frequency: { fromMinute: 400, toMinute: 1100, headwayMinutes: 30 },
      };
      const next = applyPickedTime(custom, "freqFrom", 6, 15);
      expect(next.frequency.fromMinute).toBe(375);
      expect(next.frequency.toMinute).toBe(1100);
      expect(next.departures).toEqual(custom.departures);
    });

    it("freqTo grava toMinute e não toca em fromMinute", () => {
      const custom = {
        ...baseState,
        frequency: { fromMinute: 400, toMinute: 1100, headwayMinutes: 30 },
      };
      const next = applyPickedTime(custom, "freqTo", 22, 45);
      expect(next.frequency.toMinute).toBe(1365);
      expect(next.frequency.fromMinute).toBe(400);
      expect(next.departures).toEqual(custom.departures);
    });
  });

  describe("pickerInitialMinute", () => {
    const state = {
      ...initialLineFormState(),
      frequency: { fromMinute: 420, toMinute: 1080, headwayMinutes: 20 },
    };

    it("devolve 720 para departure", () => {
      expect(pickerInitialMinute(state, "departure")).toBe(720);
    });

    it("devolve fromMinute para freqFrom", () => {
      expect(pickerInitialMinute(state, "freqFrom")).toBe(420);
    });

    it("devolve toMinute para freqTo", () => {
      expect(pickerInitialMinute(state, "freqTo")).toBe(1080);
    });
  });

  describe("setMode e toggleDayType", () => {
    const base = initialLineFormState();

    it("setMode altera somente o modo", () => {
      expect(base.mode).toBe("departures");
      const next = setMode(base, "frequency");
      expect(next.mode).toBe("frequency");
      expect(next.code).toBe(base.code);
    });

    it("toggleDayType liga e desliga sem repetir", () => {
      expect(base.dayTypeCodes).toEqual(["weekday"]);
      const withSaturday = toggleDayType(base, "saturday");
      expect(withSaturday.dayTypeCodes).toEqual(["weekday", "saturday"]);

      const withoutWeekday = toggleDayType(withSaturday, "weekday");
      expect(withoutWeekday.dayTypeCodes).toEqual(["saturday"]);

      const toggledBack = toggleDayType(withoutWeekday, "saturday");
      expect(toggledBack.dayTypeCodes).toEqual([]);
    });
  });

  describe("submitLineForm", () => {
    const validState: LineFormState = {
      code: "99",
      name: "Linha Nova",
      color: LINE_COLORS[0],
      patternLabel: "Ida",
      isCircular: false,
      stops: [
        { id: S, name: NAMES.S },
        { id: A, name: NAMES.A },
      ],
      durationText: "20",
      dayTypeCodes: ["weekday"],
      mode: "departures",
      departures: [{ hour: 9, minute: 0 }],
      frequency: { fromMinute: 360, toMinute: 1200, headwayMinutes: 30 },
    };

    it("bloqueada sem chamar o banco quando canSave for falso", async () => {
      const { db } = await setupTestDb();
      const invalidState = { ...validState, code: "" };
      let touched = false;
      const fakeDb = new Proxy(db, {
        get(target, prop, receiver) {
          touched = true;
          return Reflect.get(target, prop, receiver);
        },
      });
      const outcome = await submitLineForm(fakeDb, invalidState, 1_800_000_000_000);
      expect(outcome).toEqual({ kind: "blocked" });
      expect(touched).toBe(false);
    });

    it("criada com sucesso quando válido, e undo desfaz", async () => {
      const { db } = await setupTestDb();
      const outcome = await submitLineForm(db, validState, 1_800_000_000_000);
      expect(outcome.kind).toBe("created");
      if (outcome.kind === "created") {
        const undone = await outcome.undo(1_800_000_001_000);
        expect(undone.ok).toBe(true);
      }
    });

    it("recusada por duplicate_code quando já existe linha com esse código", async () => {
      const { db } = await setupTestDb();
      // "1" é a linha semeada
      const dupState = { ...validState, code: "1" };
      const outcome = await submitLineForm(db, dupState, 1_800_000_000_000);
      expect(outcome.kind).toBe("refused");
      if (outcome.kind === "refused") {
        expect(outcome.text.key).toBe("line_create.refusal.duplicate_code");
      }
    });

    it("recusada por invalid devolvendo o texto do primeiro motivo", async () => {
      const { db } = await setupTestDb();
      // Estado com patternLabel vazio e durationText vazio: ambos falham em validateLineDraft.
      // Primeiro motivo é pattern_label_required, segundo é duration_invalid.
      const multiInvalidState: LineFormState = {
        ...validState,
        patternLabel: "",
        durationText: "",
      };
      const outcome = await submitLineForm(db, multiInvalidState, 1_800_000_000_000);
      expect(outcome.kind).toBe("refused");
      if (outcome.kind === "refused") {
        expect(outcome.text.key).toBe("line_create.refusal.pattern_label_required");
      }
    });
  });

  describe("teste de ponta a ponta: cenário 'Teste 99' do Rick", () => {
    it("o LineFormState do cenário Teste 99 vira buildLineDraft, passa em validateLineDraft e grava com createLine", async () => {
      const { db } = await setupTestDb();
      const state: LineFormState = {
        code: "99",
        name: "Teste 99",
        color: LINE_COLORS[0],
        patternLabel: "Ida",
        isCircular: false,
        stops: [
          { id: S, name: NAMES.S },
          { id: A, name: NAMES.A },
          { id: K, name: NAMES.K },
        ],
        durationText: "25",
        dayTypeCodes: ["weekday"],
        mode: "frequency",
        departures: [],
        frequency: {
          fromMinute: 360,
          toMinute: 1200,
          headwayMinutes: 30,
        },
      };

      const draft = buildLineDraft(state);
      const validated = validateLineDraft(draft);
      expect(validated.ok).toBe(true);

      const result = await createLine(db, draft, 1_800_000_000_000);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.tripCount).toBeGreaterThan(0);
      }
    });
  });
});

/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { initialLineFormState, lineFormView, type LineFormState } from "./lineForm";
import { t } from "../i18n";

const S = { id: "stop_S", name: "Estação" };
const A = { id: "stop_A", name: "Arrabalde" };

function validDeparturesState(): LineFormState {
  return {
    ...initialLineFormState(),
    code: "1",
    name: "Linha 1",
    stops: [S, A],
    dayTypeCodes: ["weekday"],
    mode: "departures",
    departures: [{ hour: 8, minute: 0 }],
  };
}

function validFrequencyState(): LineFormState {
  return {
    ...initialLineFormState(),
    code: "1",
    name: "Linha 1",
    stops: [S, A],
    dayTypeCodes: ["weekday"],
    mode: "frequency",
    frequency: { fromMinute: 480, toMinute: 1200, headwayMinutes: 30 },
  };
}

describe("lineFormMissing: missingText", () => {
  it("initialLineFormState(): Falta código, nome, 2 paragens, horários", () => {
    const view = lineFormView(initialLineFormState());
    expect(view.missingText).toBe("Falta: código, nome, 2 paragens, horários");
  });

  it("tudo válido, 1 paragem: Falta 2 paragens", () => {
    const state: LineFormState = {
      ...validDeparturesState(),
      stops: [S],
    };
    expect(lineFormView(state).missingText).toBe("Falta: 2 paragens");
  });

  it("tudo válido, paragens [S, S]: Falta 2 paragens diferentes", () => {
    const state: LineFormState = {
      ...validDeparturesState(),
      stops: [S, S],
    };
    expect(lineFormView(state).missingText).toBe("Falta: 2 paragens diferentes");
  });

  it("tudo válido, paragens [S, A, A]: Falta sem a mesma paragem em seguida", () => {
    const state: LineFormState = {
      ...validDeparturesState(),
      stops: [S, A, A],
    };
    expect(lineFormView(state).missingText).toBe("Falta: sem a mesma paragem em seguida");
  });

  it("tudo válido, sem dia e sem horário: Falta dia, horários", () => {
    const state: LineFormState = {
      ...validDeparturesState(),
      dayTypeCodes: [],
      departures: [],
    };
    expect(lineFormView(state).missingText).toBe("Falta: dia, horários");
  });

  it("tudo válido: missingText é null", () => {
    expect(lineFormView(validDeparturesState()).missingText).toBeNull();
    expect(lineFormView(validFrequencyState()).missingText).toBeNull();
  });
});

describe("lineFormMissing: stopsNoteText", () => {
  it("sempre retorna 'Mínimo de 2 paragens'", () => {
    expect(lineFormView(initialLineFormState()).stopsNoteText).toBe("Mínimo de 2 paragens");
    expect(lineFormView(validDeparturesState()).stopsNoteText).toBe("Mínimo de 2 paragens");
  });
});

describe("lineFormMissing: stopsProblemText", () => {
  it("paragens vazias retorna null", () => {
    const state = { ...validDeparturesState(), stops: [] };
    expect(lineFormView(state).stopsProblemText).toBeNull();
  });

  it("1 paragem retorna null", () => {
    const state = { ...validDeparturesState(), stops: [S] };
    expect(lineFormView(state).stopsProblemText).toBeNull();
  });

  it("[S, S] retorna o texto de stops_distinct", () => {
    const state = { ...validDeparturesState(), stops: [S, S] };
    expect(lineFormView(state).stopsProblemText).toBe(
      t("line_create.refusal.stops_distinct", { min: 2 }),
    );
  });

  it("[S, A, A] retorna o texto de stops_adjacent", () => {
    const state = { ...validDeparturesState(), stops: [S, A, A] };
    expect(lineFormView(state).stopsProblemText).toBe(
      t("line_create.refusal.stops_adjacent"),
    );
  });

  it("[S, A] válido retorna null", () => {
    const state = { ...validDeparturesState(), stops: [S, A] };
    expect(lineFormView(state).stopsProblemText).toBeNull();
  });
});

describe("lineFormMissing: invariante canSave === (missing.length === 0)", () => {
  const cases: [string, LineFormState][] = [
    ["1. válido departures", validDeparturesState()],
    ["2. válido frequency", validFrequencyState()],
    ["3. código vazio", { ...validDeparturesState(), code: "" }],
    ["4. nome vazio", { ...validDeparturesState(), name: "  " }],
    ["5. stops insuficiente (< 2)", { ...validDeparturesState(), stops: [S] }],
    ["6. stops repetido adjacente", { ...validDeparturesState(), stops: [S, A, A] }],
    ["7. stops duplicado não adjacente mas < 2 distintos", { ...validDeparturesState(), stops: [S, S] }],
    ["8. sem tipos de dia", { ...validDeparturesState(), dayTypeCodes: [] }],
    ["9. departures vazio", { ...validDeparturesState(), departures: [] }],
    ["10. frequency headway zero", { ...validFrequencyState(), frequency: { fromMinute: 480, toMinute: 1200, headwayMinutes: 0 } }],
    ["11. initialLineFormState", initialLineFormState()],
    ["12. código vazio e sem dia", { ...validDeparturesState(), code: "", dayTypeCodes: [] }],
  ];

  it.each(cases)("%s satisfaz canSave === (missing.length === 0)", (_name, state) => {
    const view = lineFormView(state);
    expect(view.canSave).toBe(view.missing.length === 0);
  });
});

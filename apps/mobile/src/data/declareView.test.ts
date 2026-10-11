// E-08 item 4 (TL-07): o que a folha "Declarar horário" mostra e consome, por campo. Rede inventada (D-091).
import type { DayTypeCode, DeclareStep } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { type DeclareDraft, buildDeclareView, declareToast, passageKey } from "./declareView";
import { fixture, stopId } from "./registroFixture";
import type { ScheduleSnapshot } from "./schedule";

const hm = (hour: number, minute: number) => ({ hour, minute });
const draft = (over: Partial<DeclareDraft> = {}): DeclareDraft => ({ lineCode: null, hour: null, passage: null, dayTypes: [], ...over });
const WEEKDAY: DayTypeCode[] = ["weekday"];
type Replaces = { origin: "official" | "declared"; serviceMinute: number } | null;

async function data(): Promise<ScheduleSnapshot> {
  return (await fixture()).data;
}

describe("linha", () => {
  it("ponto com várias linhas: lista as linhas e não escolhe nenhuma", async () => {
    const view = buildDeclareView(stopId("A"), await data(), draft());
    expect(view.lines.map((l) => l.code)).toEqual(["1", "2", "3"]);
    expect(view.lineCode).toBeNull();
    expect(view.canSave).toBe(false);
  });

  it("ponto com uma linha só: a linha já vem escolhida", async () => {
    const view = buildDeclareView(stopId("C"), await data(), draft());
    expect(view.lines.map((l) => l.code)).toEqual(["1"]);
    expect(view.lineCode).toBe("1");
  });

  it("linha escolhida que não serve o ponto não vale", async () => {
    expect(buildDeclareView(stopId("C"), await data(), draft({ lineCode: "2" })).lineCode).toBe("1");
    expect(buildDeclareView(stopId("A"), await data(), draft({ lineCode: "9" })).lineCode).toBeNull();
  });
});

describe("canSave: só com todos os campos obrigatórios", () => {
  it("sem hora, sem tipo de dia ou sem linha: desabilitado; com tudo: habilitado", async () => {
    const d = await data();
    const full = draft({ lineCode: "1", hour: hm(8, 35), dayTypes: WEEKDAY });
    expect(buildDeclareView(stopId("C"), d, full).canSave).toBe(true);
    expect(buildDeclareView(stopId("C"), d, { ...full, hour: null }).canSave).toBe(false);
    expect(buildDeclareView(stopId("C"), d, { ...full, dayTypes: [] }).canSave).toBe(false);
    expect(buildDeclareView(stopId("A"), d, { ...full, lineCode: null }).canSave).toBe(false);
  });

  it("o plano ao vivo acompanha o rascunho: 08:35 casa (update); 08:50 não casa (create_partial)", async () => {
    const d = await data();
    const at = (h: number, m: number) => buildDeclareView(stopId("C"), d, draft({ hour: hm(h, m), dayTypes: WEEKDAY })).plan;
    expect(at(8, 35)?.steps.map((s) => s.action)).toEqual(["update"]);
    expect(at(8, 50)?.steps.map((s) => s.action)).toEqual(["create_partial"]);
    expect(at(8, 35)?.serviceMinute).toBe(8 * 60 + 35);
  });
});

describe("passagem (D-121)", () => {
  it("ponto com uma passagem: o campo não aparece e o Salvar não depende dele", async () => {
    const view = buildDeclareView(stopId("C"), await data(), draft({ hour: hm(8, 35), dayTypes: WEEKDAY }));
    expect(view.showPassage).toBe(false);
    expect(view.passageOptions).toEqual([]);
    expect(view.canSave).toBe(true);
  });

  it("Estádio na L1 passa 2 vezes no percurso: chips 1ª e 2ª; o Salvar espera a escolha", async () => {
    const d = await data();
    const base = draft({ lineCode: "1", hour: hm(8, 35), dayTypes: WEEKDAY });
    const view = buildDeclareView(stopId("E"), d, base);
    expect(view.showPassage).toBe(true);
    expect(view.passageOptions.map((o) => [o.label, o.position])).toEqual([["1ª", 3], ["2ª", 6]]);
    expect(view.canSave).toBe(false);
    const patternId = view.passageOptions[0]!.patternId;
    const chosen = buildDeclareView(stopId("E"), d, { ...base, passage: passageKey(patternId, 6) });
    expect(chosen.canSave).toBe(true);
    expect(chosen.plan?.steps[0]).toMatchObject({ position: 6 });
  });

  it("passagem que não é do ponto não conta como escolhida", async () => {
    const view = buildDeclareView(stopId("E"), await data(), draft({ lineCode: "1", hour: hm(8, 35), dayTypes: WEEKDAY, passage: "nada:1" }));
    expect(view.canSave).toBe(false);
  });

  it("Arrabalde na L3 passa 2 vezes: 1ª e 2ª", async () => {
    const view = buildDeclareView(stopId("A"), await data(), draft({ lineCode: "3" }));
    expect(view.passageOptions.map((o) => o.label)).toEqual(["1ª", "2ª"]);
  });

  describe("percursos diferentes (rótulo do percurso)", () => {
    // Um segundo percurso da L1 que passa uma vez no Estádio (e um da L1 com a repetição do primeiro).
    async function withSecondPattern(): Promise<ScheduleSnapshot> {
      const d = await data();
      const info = [...d.patternLine.values()].find((l) => l.code === "1")!;
      return {
        ...d,
        patterns: [...d.patterns, { id: "pat-x", stops: [1, 2, 3].map((position) => ({ position, stopId: [stopId("S"), stopId("E"), stopId("K")][position - 1]!, isTimepoint: false })) }],
        patternLine: new Map([...d.patternLine, ["pat-x", info]]),
      };
    }

    it("uma passagem em cada percurso: o rótulo do percurso, sem número", async () => {
      const d = await data();
      const info = [...d.patternLine.values()].find((l) => l.code === "3")!;
      const two: ScheduleSnapshot = {
        ...d,
        patterns: [
          { id: "pa", stops: [{ position: 1, stopId: stopId("S"), isTimepoint: false }, { position: 2, stopId: stopId("E"), isTimepoint: false }, { position: 3, stopId: stopId("K"), isTimepoint: false }] },
          { id: "pb", stops: [{ position: 1, stopId: stopId("S"), isTimepoint: false }, { position: 2, stopId: stopId("C"), isTimepoint: false }, { position: 3, stopId: stopId("E"), isTimepoint: false }, { position: 4, stopId: stopId("X"), isTimepoint: false }] },
        ],
        patternLine: new Map([["pa", info], ["pb", info]]),
      };
      const view = buildDeclareView(stopId("E"), two, draft({ lineCode: "3" }));
      expect(view.passageOptions.map((o) => o.label)).toEqual(["→ Campus Exemplo", "→ Praça X"]);
    });

    it("percurso diferente e repetição no mesmo: 'rótulo · 2ª'", async () => {
      const view = buildDeclareView(stopId("E"), await withSecondPattern(), draft({ lineCode: "1" }));
      expect(view.passageOptions.map((o) => o.label)).toEqual(["→ Estação Inventada · 1ª", "→ Estação Inventada · 2ª", "→ Campus Exemplo"]);
    });

    it("rótulos iguais ganham a posição para desempatar", async () => {
      const d = await data();
      const info = [...d.patternLine.values()].find((l) => l.code === "3")!;
      const same: ScheduleSnapshot = {
        ...d,
        patterns: [
          { id: "pa", stops: [{ position: 1, stopId: stopId("E"), isTimepoint: false }, { position: 2, stopId: stopId("K"), isTimepoint: false }] },
          { id: "pb", stops: [{ position: 1, stopId: stopId("S"), isTimepoint: false }, { position: 2, stopId: stopId("E"), isTimepoint: false }, { position: 3, stopId: stopId("K"), isTimepoint: false }] },
        ],
        patternLine: new Map([["pa", info], ["pb", info]]),
      };
      const labels = buildDeclareView(stopId("E"), same, draft({ lineCode: "3" })).passageOptions.map((o) => o.label);
      expect(new Set(labels).size).toBe(2);
    });
  });
});

describe("texto de apoio", () => {
  it("madrugada: 00:00 a 03:59 mostra o texto; 04:00 e sem hora, não", async () => {
    const d = await data();
    const hint = (hour: DeclareDraft["hour"]) => buildDeclareView(stopId("C"), d, draft({ hour, dayTypes: WEEKDAY })).showNightHint;
    expect(hint(hm(0, 0))).toBe(true);
    expect(hint(hm(0, 20))).toBe(true);
    expect(hint(hm(3, 59))).toBe(true);
    expect(hint(hm(4, 0))).toBe(false);
    expect(hint(hm(8, 35))).toBe(false);
    expect(hint(null)).toBe(false);
  });

  it("'vale só neste ponto' só quando o plano cria viagem nova", async () => {
    const d = await data();
    const partial = (h: number, m: number, days: DayTypeCode[] = WEEKDAY) => buildDeclareView(stopId("C"), d, draft({ hour: hm(h, m), dayTypes: days })).showPartialHint;
    expect(partial(8, 50)).toBe(true);
    expect(partial(8, 35)).toBe(false);
    expect(partial(8, 35, ["weekday", "saturday"])).toBe(true); // sábado não tem viagem
    expect(partial(8, 50, [])).toBe(false);
  });

  it("madrugada vira o fim do dia anterior no minuto de serviço do plano", async () => {
    const view = buildDeclareView(stopId("C"), await data(), draft({ hour: hm(0, 20), dayTypes: WEEKDAY }));
    expect(view.plan?.serviceMinute).toBe(1460);
  });
});

describe("declareToast", () => {
  const update = (replaces: Replaces, dayType: DayTypeCode = "weekday", alsoAffects: DayTypeCode[] = []): DeclareStep => ({
    dayType, action: "update", tripId: "t", patternId: "p", position: 2, replaces, alsoAffects,
  });
  const create = (dayType: DayTypeCode): DeclareStep => ({ dayType, action: "create_partial", patternId: "p", position: 2 });

  it("simples", () => {
    expect(declareToast([update(null)])).toBe("Horário declarado");
    expect(declareToast([create("weekday")])).toBe("Horário declarado");
  });

  it("substitui o oficial e o declarado", () => {
    expect(declareToast([update({ origin: "official", serviceMinute: 810 })])).toBe("Horário declarado (substitui 13:30 da MOBILIS)");
    expect(declareToast([update({ origin: "declared", serviceMinute: 530 })])).toBe("Horário declarado (substitui 08:50 que você declarou)");
  });

  it("madrugada na hora substituída vira hora de relógio", () => {
    expect(declareToast([update({ origin: "official", serviceMinute: 1460 })])).toBe("Horário declarado (substitui 00:20 da MOBILIS)");
  });

  it("atualizou uma e criou outra", () => {
    expect(declareToast([update(null, "weekday"), create("saturday")])).toBe("Atualizou a viagem de dia útil e criou uma nova para sábado");
    expect(declareToast([update(null, "weekday"), create("saturday"), create("sunday_holiday")])).toBe(
      "Atualizou a viagem de dia útil e criou uma nova para sábado e domingo e feriado",
    );
  });

  it("alsoAffects acrescenta 'Vale também para …'", () => {
    expect(declareToast([update(null, "weekday", ["saturday"])])).toBe("Horário declarado. Vale também para sábado.");
    expect(declareToast([update({ origin: "official", serviceMinute: 810 }, "weekday", ["saturday", "sunday_holiday"])])).toBe(
      "Horário declarado (substitui 13:30 da MOBILIS). Vale também para sábado e domingo e feriado.",
    );
  });

  it("o toast do plano ao vivo é o mesmo texto", async () => {
    const view = buildDeclareView(stopId("C"), await data(), draft({ hour: hm(8, 35), dayTypes: WEEKDAY }));
    expect(view.toast).toBe("Horário declarado");
  });
});

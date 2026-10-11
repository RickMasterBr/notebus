// E-08 bloco 5, item 8: a lista "Declarados neste ponto" e o aviso da remoção. Rede inventada (D-091).
import { describe, expect, it } from "vitest";
import { declaredList, removePlan, removeToast } from "./declareView";
import { fixture, stopId } from "./registroFixture";
import type { ScheduleSnapshot } from "./schedule";

/** Marca como declarados os horários de um ponto (linha dada) nas posições e minutos pedidos. */
async function withDeclared(extra: { line: string; stop: "A" | "C" | "K"; minute: number }[]): Promise<ScheduleSnapshot> {
  const d = (await fixture()).data;
  const used = new Set<string>();
  const trips = d.trips.map((trip) => ({ ...trip, stopTimes: [...trip.stopTimes] }));
  for (const e of extra) {
    const patternId = [...d.patternLine].find(([, info]) => info.code === e.line)![0];
    const pattern = d.patterns.find((p) => p.id === patternId)!;
    const position = pattern.stops.find((s) => s.stopId === stopId(e.stop))!.position;
    const trip = trips.find((t) => t.patternId === patternId && !used.has(t.id))!;
    used.add(trip.id);
    trip.stopTimes = trip.stopTimes.filter((st) => st.position !== position);
    trip.stopTimes.push({ position, serviceMinute: e.minute, origin: "declared" });
  }
  return { ...d, trips };
}

describe("declaredList", () => {
  it("sem horário declarado no ponto: lista vazia (a seção não aparece)", async () => {
    const d = (await fixture()).data;
    expect(declaredList(stopId("C"), d)).toEqual([]);
  });

  it("uma linha por horário declarado neste ponto, com linha, hora e tipos de dia", async () => {
    const d = await withDeclared([{ line: "1", stop: "C", minute: 8 * 60 + 50 }]);
    const rows = declaredList(stopId("C"), d);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lineCode: "1", timeText: "08:50", serviceMinute: 530 });
    expect(rows[0]!.dayTypesText).toBe("dia útil");
  });

  it("só os declarados deste ponto: o de outro ponto fica de fora", async () => {
    const d = await withDeclared([
      { line: "1", stop: "C", minute: 8 * 60 + 50 },
      { line: "2", stop: "K", minute: 8 * 60 + 52 },
    ]);
    expect(declaredList(stopId("C"), d).map((r) => r.lineCode)).toEqual(["1"]);
    expect(declaredList(stopId("K"), d).map((r) => r.lineCode)).toEqual(["2"]);
  });

  it("ordena por hora e, na mesma hora, por linha", async () => {
    const d = await withDeclared([
      { line: "2", stop: "A", minute: 9 * 60 },
      { line: "1", stop: "A", minute: 9 * 60 },
      { line: "3", stop: "A", minute: 8 * 60 },
    ]);
    expect(declaredList(stopId("A"), d).map((r) => `${r.timeText} ${r.lineCode}`)).toEqual(["08:00 3", "09:00 1", "09:00 2"]);
  });

  it("horário oficial nunca entra na lista", async () => {
    const d = await withDeclared([{ line: "1", stop: "C", minute: 8 * 60 + 50 }]);
    expect(declaredList(stopId("A"), d).every((r) => r.serviceMinute !== undefined)).toBe(true);
    expect(declaredList(stopId("A"), d)).toEqual([]);
  });
});

describe("removePlan e removeToast", () => {
  it("o pedido leva o ponto, o percurso, a viagem, a posição e o horário da linha tocada", async () => {
    const d = await withDeclared([{ line: "1", stop: "C", minute: 530 }]);
    const row = declaredList(stopId("C"), d)[0]!;
    expect(removePlan(stopId("C"), row)).toEqual({
      stopId: stopId("C"),
      patternId: row.patternId,
      tripId: row.tripId,
      position: row.position,
      serviceMinute: 530,
    });
  });

  it("sem oficial de volta: 'Horário removido'; com oficial: diz qual hora volta", () => {
    expect(removeToast(null)).toBe("Horário removido");
    expect(removeToast(530)).toBe("Horário removido (volta 08:50 da MOBILIS)");
  });
});

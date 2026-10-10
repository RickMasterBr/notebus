/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { fixture } from "../data/registroFixture";
import { listLines, listPatternsOfLine, listStops } from "./networkList";
import * as schema from "./schema";

describe("db/networkList: consultas de leitura da rede (TL-11, Item 2)", () => {
  it("listLines devolve linhas vivas em ordem numérica e ignora apagadas", async () => {
    const { db } = await fixture();
    const now = 1760000000000;

    // A fixture inicial tem linhas com códigos "1", "2", "3".
    // Vamos adicionar a linha "11" para testar ordem numérica ("2" antes de "11", e não alfabética).
    await db.insert(schema.line).values({
      id: "line-11-test",
      networkId: "net-test",
      code: "11",
      name: "Linha Onze",
      color: "#000000",
      source: "official",
      createdAt: now,
      updatedAt: now,
    });

    // Adiciona percurso à linha 11
    await db.insert(schema.pattern).values({
      id: "pattern-11-test",
      lineId: "line-11-test",
      label: "Percurso Onze",
      isCircular: false,
      source: "official",
      createdAt: now,
      updatedAt: now,
    });

    // Adiciona uma linha apagada (soft deleted) que NÃO deve aparecer
    await db.insert(schema.line).values({
      id: "line-deleted-test",
      networkId: "net-test",
      code: "0",
      name: "Linha Apagada",
      color: "#999999",
      source: "user",
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    });

    const lines = await listLines(db);
    expect(lines.some((l) => l.id === "line-deleted-test")).toBe(false);

    const codes = lines.map((l) => l.code);
    expect(codes).toEqual(["1", "2", "3", "11"]);
    // Garante que "2" vem antes de "11"
    const index2 = codes.indexOf("2");
    const index11 = codes.indexOf("11");
    expect(index2).toBeLessThan(index11);

    const line11 = lines.find((l) => l.code === "11")!;
    expect(line11.patternCount).toBe(1);
  });

  it("listStops devolve pontos vivos ordenados por nome sem acento e ignora apagados", async () => {
    const { db } = await fixture();
    const now = 1760000000000;

    // Adiciona ponto com acento e minúscula/maiúscula
    await db.insert(schema.stop).values([
      {
        id: "stop-ar-1",
        networkId: "net-test",
        name: "Águas Vivas",
        aliases: ["Fonte"],
        externalId: "1001",
        source: "official",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "stop-ar-2",
        networkId: "net-test",
        name: "aguas claras",
        aliases: [],
        externalId: "1002",
        source: "user",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "stop-del-test",
        networkId: "net-test",
        name: "Ponto Apagado",
        aliases: [],
        externalId: "9999",
        source: "user",
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
      },
    ]);

    const stops = await listStops(db);
    expect(stops.some((s) => s.id === "stop-del-test")).toBe(false);

    // Confere que ordenação é sem acento e case-insensitive
    const aguas = stops.filter((s) => s.name.toLowerCase().includes("aguas") || s.name.toLowerCase().includes("águas"));
    expect(aguas.length).toBe(2);
    expect(aguas[0]!.name).toBe("aguas claras");
    expect(aguas[1]!.name).toBe("Águas Vivas");
  });

  it("listPatternsOfLine devolve percursos com paragens ordenadas, suporta circular e ignora apagados", async () => {
    const { db } = await fixture();
    const now = 1760000000000;

    // Linha 1 da fixture é circular e tem 7 paragens:
    // 1 S · 2 A · 3 E · 4 C · 5 K · 6 E · 7 S (S e E aparecem repetidos em posições diferentes)
    const lines = await listLines(db);
    const line1 = lines.find((l) => l.code === "1")!;

    // Adiciona um percurso apagado à linha 1 para conferir que não aparece
    await db.insert(schema.pattern).values({
      id: "pattern-del-test",
      lineId: line1.id,
      label: "Percurso Apagado",
      isCircular: false,
      source: "user",
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    });

    const patterns = await listPatternsOfLine(db, line1.id);
    expect(patterns.some((p) => p.id === "pattern-del-test")).toBe(false);
    expect(patterns.length).toBeGreaterThan(0);

    const firstPattern = patterns[0]!;
    await db.update(schema.pattern).set({ isCircular: true }).where(eq(schema.pattern.id, firstPattern.id));

    const updatedPatterns = await listPatternsOfLine(db, line1.id);
    const circularPattern = updatedPatterns.find((p) => p.isCircular);
    expect(circularPattern).toBeDefined();

    const stops = circularPattern!.stops;
    // Paragens devem estar em ordem estrita de position crescente
    const positions = stops.map((s) => s.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    // Ponto repetido no mesmo percurso (Estação em 1 e 7, Estádio em 3 e 6) aparece nas duas posições
    const estacaoStops = stops.filter((s) => s.name === "Estação Inventada");
    expect(estacaoStops.length).toBe(2);
    expect(estacaoStops[0]!.position).toBe(1);
    expect(estacaoStops[1]!.position).toBe(7);

    // Se um ponto for apagado, a paragem correspondente não deve aparecer
    const firstStopId = stops[0]!.stopId;
    await db.update(schema.stop).set({ deletedAt: now }).where(eq(schema.stop.id, firstStopId));

    const patternsAfterStopDelete = await listPatternsOfLine(db, line1.id);
    const stopsAfterDelete = patternsAfterStopDelete.find((p) => p.id === circularPattern!.id)!.stops;
    expect(stopsAfterDelete.some((s) => s.stopId === firstStopId)).toBe(false);
  });
});

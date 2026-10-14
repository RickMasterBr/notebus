/// <reference types="node" />
/**
 * Teste de decisão de valores fixos do startEmpty (D-201, E-08.5 Bloco 8, L1, L2, L7).
 * Dados inventados (D-091).
 * Não importa as constantes de startEmpty para testar valores literais independentes.
 */
import { officialId } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { dayType, holiday, network } from "./schema";
import { startEmpty, USER_NETWORK_NAME, USER_NETWORK_TIMEZONE } from "./startEmpty";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_800_000_000_000;

function fresh() {
  const { db } = testDbWithSqlite();
  return { db };
}

describe("startEmptyDecision (D-201, L1, L2, L7)", () => {
  it("grava a rede com os literais fixos da decisão", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);

    const nets = await db.select().from(network);
    expect(nets).toHaveLength(1);
    expect(nets[0]).toEqual(
      expect.objectContaining({
        id: officialId("notebus/user/network"),
        name: "Minha rede",
        timezone: "Europe/Lisbon",
        source: "user",
        officialKey: null,
      }),
    );
  });

  it("grava exatamente os 3 tipos de dia com nomes, ordenação e ids literais", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);

    const days = await db.select().from(dayType);
    expect(days).toHaveLength(3);

    const expectedNetworkId = officialId("notebus/user/network");

    const byCode = Object.fromEntries(days.map((d) => [d.code, d]));

    expect(byCode.weekday).toEqual(
      expect.objectContaining({
        id: officialId("notebus/user/day_type/weekday"),
        code: "weekday",
        name: "Dia útil",
        sort: 1,
        networkId: expectedNetworkId,
        source: "user",
        officialKey: null,
      }),
    );

    expect(byCode.saturday).toEqual(
      expect.objectContaining({
        id: officialId("notebus/user/day_type/saturday"),
        code: "saturday",
        name: "Sábado",
        sort: 2,
        networkId: expectedNetworkId,
        source: "user",
        officialKey: null,
      }),
    );

    expect(byCode.sunday_holiday).toEqual(
      expect.objectContaining({
        id: officialId("notebus/user/day_type/sunday_holiday"),
        code: "sunday_holiday",
        name: "Domingo e feriado",
        sort: 3,
        networkId: expectedNetworkId,
        source: "user",
        officialKey: null,
      }),
    );
  });

  it("não grava nenhum feriado", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);

    const holidays = await db.select().from(holiday);
    expect(holidays).toEqual([]);
  });

  it("exporta as constantes com os literais decididos", () => {
    expect(USER_NETWORK_NAME).toBe("Minha rede");
    expect(USER_NETWORK_TIMEZONE).toBe("Europe/Lisbon");
  });
});

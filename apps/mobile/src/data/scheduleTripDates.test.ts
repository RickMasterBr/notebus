/// <reference types="node" />
// Dados inventados (D-091). O banco guarda `notOn`/`alsoOn` (formato 2) e o app os lê: nada montado à mão.
import { lineServiceOn } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { importMobilis, type ImportDb } from "../db/importMobilis";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { exampleSeed } from "../db/testing/exampleSeed";
import { buildStopCard } from "./stopCard";
import { loadSchedule } from "./schedule";

async function loaded() {
  const { db, sqlite } = testDbWithSqlite();
  const importDb: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  const seed = structuredClone(exampleSeed("2025-06-01"));
  seed.formatVersion = 2;
  seed.trips[1]!.notOn = ["2026-12-25"];
  seed.trips[1]!.alsoOn = ["2026-12-24"];
  await importMobilis(importDb, seed);
  return { db, sqlite, seed, snap: await loadSchedule(db) };
}

describe("loadSchedule carrega as exceções de data do banco", () => {
  it("notOn e alsoOn na viagem certa, e nenhuma das chaves nas outras", async () => {
    const { snap, seed } = await loaded();
    const byId = new Map(snap.schedule.trips.map((t) => [t.id, t]));
    expect(byId.get(seed.trips[1]!.id)).toMatchObject({ notOn: ["2026-12-25"], alsoOn: ["2026-12-24"] });
    const other = byId.get(seed.trips[0]!.id)!;
    expect(other).not.toHaveProperty("notOn");
    expect(other).not.toHaveProperty("alsoOn");
  });

  it("linha apagada não conta", async () => {
    const { db, sqlite, seed } = await loaded();
    sqlite.exec("UPDATE trip_date SET deleted_at = 1 WHERE kind = 'not_on'");
    const trip = (await loadSchedule(db)).schedule.trips.find((t) => t.id === seed.trips[1]!.id)!;
    expect(trip).not.toHaveProperty("notOn");
    expect(trip).toMatchObject({ alsoOn: ["2026-12-24"] });
  });

  it("do banco ao cartão: data_sem_servico e date_off em 25/12/2026", async () => {
    const { snap, seed } = await loaded();
    expect(lineServiceOn("2026-12-25", snap.calendar, snap.schedule)).toMatchObject({ status: "none", reason: "data_sem_servico" });
    const stopId = seed.stops.find((s) => s.key === "mobilis/stop/9001")!.id;
    const card = buildStopCard(stopId, snap, Date.parse("2026-12-25T10:00:00Z")); // inverno: UTC+0
    expect(card?.lines[0]?.state).toMatchObject({ status: "later", reason: { kind: "date_off" } });
  });
});

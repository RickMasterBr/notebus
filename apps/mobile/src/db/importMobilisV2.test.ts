/// <reference types="node" />
// Só teste: roda no Node, não no app. Dados inventados (D-091): semente do formato 2 montada a partir do `exampleSeed`.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SeedFile } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { importMobilis } from "./importMobilis";
import { migrateProtected } from "./migrate";
import { migrations } from "./migrations";
import { exampleSeed } from "./testing/exampleSeed";
import { NodeSqlite, nodeBackupStore } from "./testing/nodeSqlite";

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "notebus-importv2-"));
  const conn = new NodeSqlite(join(dir, "notebus.db"));
  await migrateProtected({ db: conn, backups: nodeBackupStore(conn, join(dir, "backups")), migrations });
  return conn;
}

const now = () => 1_790_000_000_000;

/** Formato 2: a viagem de fim de semana não circula em 25/12 e circula em 24/12; o primeiro ponto ganha coordenada. */
export function seedV2(notOn: string[] = ["2026-12-25"]): SeedFile {
  const s = structuredClone(exampleSeed());
  s.formatVersion = 2;
  s.trips[1]!.notOn = notOn;
  s.trips[1]!.alsoOn = ["2026-12-24"];
  s.stops[0]!.lat = 39.7;
  s.stops[0]!.lon = -8.8;
  return s;
}

const tripDates = (conn: NodeSqlite) =>
  conn.all("SELECT trip_id, date, kind, source, official_key FROM trip_date ORDER BY date");
const coords = (conn: NodeSqlite, externalId: string) =>
  conn.all("SELECT lat, lon, location_source FROM stop WHERE external_id = ?", [externalId])[0];

describe("importMobilis, formato 2: trip_date", () => {
  it("grava uma linha por data, com kind, viagem e chave", async () => {
    const conn = await setup();
    const seed = seedV2();
    const report = await importMobilis(conn, seed, { now });
    const trip = seed.trips[1]!;
    expect(report.tables.trip_date).toEqual({ total: 2, inserted: 2 });
    expect(tripDates(conn)).toEqual([
      { trip_id: trip.id, date: "2026-12-24", kind: "also_on", source: "official", official_key: `${trip.key}/date/2026-12-24` },
      { trip_id: trip.id, date: "2026-12-25", kind: "not_on", source: "official", official_key: `${trip.key}/date/2026-12-25` },
    ]);
  });

  it("reimportar o mesmo arquivo não grava nada; data a mais grava só a nova", async () => {
    const conn = await setup();
    await importMobilis(conn, seedV2(), { now });
    const before = tripDates(conn);

    expect((await importMobilis(conn, seedV2(), { now })).tables.trip_date).toEqual({ total: 2, inserted: 0 });
    expect(tripDates(conn)).toEqual(before);

    const more = await importMobilis(conn, seedV2(["2026-12-25", "2027-01-01"]), { now });
    expect(more.tables.trip_date).toEqual({ total: 3, inserted: 1 });
    expect(tripDates(conn)).toHaveLength(3);
    for (const row of before) expect(tripDates(conn)).toContainEqual(row);
  });

  it("arquivo sem notOn nem alsoOn, e arquivo do formato 1, gravam zero linhas", async () => {
    const conn = await setup();
    expect((await importMobilis(conn, exampleSeed(), { now })).tables.trip_date).toEqual({ total: 0, inserted: 0 });
    const plain = seedV2();
    delete plain.trips[1]!.notOn;
    delete plain.trips[1]!.alsoOn;
    expect((await importMobilis(conn, plain, { now })).tables.trip_date).toEqual({ total: 0, inserted: 0 });
    expect(tripDates(conn)).toEqual([]);
  });
});

describe("importMobilis, formato 2: coordenadas dos pontos", () => {
  it("ponto novo entra com a coordenada", async () => {
    const conn = await setup();
    await importMobilis(conn, seedV2(), { now });
    expect(coords(conn, "9001")).toEqual({ lat: 39.7, lon: -8.8, location_source: null });
  });

  it("ponto existente vazio recebe a coordenada na importação seguinte", async () => {
    const conn = await setup();
    await importMobilis(conn, exampleSeed(), { now });
    expect(coords(conn, "9001")).toEqual({ lat: null, lon: null, location_source: null });
    await importMobilis(conn, seedV2(), { now });
    expect(coords(conn, "9001")).toEqual({ lat: 39.7, lon: -8.8, location_source: null });
  });

  it("ponto com coordenada oficial já gravada não é alterado", async () => {
    const conn = await setup();
    await importMobilis(conn, exampleSeed(), { now });
    conn.exec("UPDATE stop SET lat = 40.1, lon = -8.1 WHERE external_id = '9001'");
    await importMobilis(conn, seedV2(), { now });
    expect(coords(conn, "9001")).toEqual({ lat: 40.1, lon: -8.1, location_source: null });
  });

  it("ponto com location_source (a pessoa gravou) não é alterado", async () => {
    const conn = await setup();
    await importMobilis(conn, exampleSeed(), { now });
    conn.exec("UPDATE stop SET location_source = 'suggested' WHERE external_id = '9001'");
    await importMobilis(conn, seedV2(), { now });
    expect(coords(conn, "9001")).toEqual({ lat: null, lon: null, location_source: "suggested" });
  });

  it("arquivo do formato 1 deixa lat e lon como estão", async () => {
    const conn = await setup();
    await importMobilis(conn, exampleSeed(), { now });
    expect(coords(conn, "9001")).toEqual({ lat: null, lon: null, location_source: null });
    conn.exec("UPDATE stop SET lat = 40.1, lon = -8.1 WHERE external_id = '9001'");
    await importMobilis(conn, exampleSeed("2027-03-01"), { now });
    expect(coords(conn, "9001")).toEqual({ lat: 40.1, lon: -8.1, location_source: null });
  });
});

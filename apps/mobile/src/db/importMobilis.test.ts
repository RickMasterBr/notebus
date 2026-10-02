/// <reference types="node" />
// Só teste: roda no Node, não no app. Dados inventados (D-091); os reais ficam no repositório privado.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SeedFormatError } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { type ImportDb, importMobilis } from "./importMobilis";
import { migrateProtected } from "./migrate";
import { migrations } from "./migrations";
import { exampleSeed } from "./testing/exampleSeed";
import { NodeSqlite, nodeBackupStore } from "./testing/nodeSqlite";

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "notebus-import-"));
  const conn = new NodeSqlite(join(dir, "notebus.db"));
  await migrateProtected({ db: conn, backups: nodeBackupStore(conn, join(dir, "backups")), migrations });
  return conn;
}

const IMPORTED = [
  "network", "day_type", "season", "dataset", "line", "stop", "pattern", "pattern_stop",
  "timetable", "trip", "trip_day_type", "stop_time",
];
const TIME = 1_790_000_000_000;
const now = () => TIME;

/** Todas as linhas das tabelas que o importador toca (e das do usuário), para comparar antes e depois. */
function snapshot(conn: NodeSqlite, tables = [...IMPORTED, "observation"]) {
  return Object.fromEntries(tables.map((t) => [t, conn.all(`SELECT * FROM \`${t}\` ORDER BY id`)]));
}
const counts = (conn: NodeSqlite) =>
  Object.fromEntries(IMPORTED.map((t) => [t, (conn.all(`SELECT COUNT(*) AS n FROM \`${t}\``)[0]!.n as number)]));

/** Referências soltas no banco (D-122: sem chave estrangeira, quem confere somos nós). */
const REFS: [string, string, string][] = [
  ["day_type", "network_id", "network"], ["season", "network_id", "network"], ["dataset", "network_id", "network"],
  ["line", "network_id", "network"], ["stop", "network_id", "network"],
  ["pattern", "line_id", "line"], ["pattern_stop", "pattern_id", "pattern"], ["pattern_stop", "stop_id", "stop"],
  ["timetable", "pattern_id", "pattern"], ["timetable", "dataset_id", "dataset"],
  ["trip", "timetable_id", "timetable"], ["trip", "season_id", "season"],
  ["trip_day_type", "trip_id", "trip"], ["trip_day_type", "day_type_id", "day_type"],
  ["stop_time", "trip_id", "trip"], ["stop_time", "pattern_stop_id", "pattern_stop"],
];
function danglingRefs(conn: NodeSqlite): string[] {
  return REFS.flatMap(([table, col, target]) =>
    conn
      .all(`SELECT t.id FROM \`${table}\` t LEFT JOIN \`${target}\` r ON r.id = t.\`${col}\` WHERE t.\`${col}\` IS NOT NULL AND r.id IS NULL`)
      .map((r) => `${table}.${col} → ${target} (${r.id})`),
  );
}

/** Banco que quebra na N-ésima gravação, para provar a transação. */
function failingOn(conn: NodeSqlite, nth: number): ImportDb {
  let runs = 0;
  return {
    exec: (sql) => conn.exec(sql),
    all: async (sql, params) => conn.all(sql, params),
    run: async (sql, params) => {
      if (++runs === nth) throw new Error("falha forçada");
      return conn.run(sql, params);
    },
  };
}

describe("importMobilis com o exemplo inventado", () => {
  it("grava tudo, com as contagens do arquivo e sem referência solta", async () => {
    const conn = await setup();
    const report = await importMobilis(conn, exampleSeed(), { now });

    expect(counts(conn)).toEqual({
      network: 1, day_type: 3, season: 1, dataset: 1, line: 1, stop: 3, pattern: 1, pattern_stop: 3,
      timetable: 1, trip: 2, trip_day_type: 3, stop_time: 6,
    });
    expect(Object.keys(report.tables)).toEqual(expect.arrayContaining(IMPORTED));
    expect(Object.fromEntries(Object.entries(report.tables).map(([t, r]) => [t, r.inserted]))).toEqual(counts(conn));
    expect(report.newDataset).toBe(true);
    expect(danglingRefs(conn)).toEqual([]);
    // as colunas comuns e a ligação trip → época → dataset
    expect(conn.all("SELECT source, created_at, deleted_at FROM trip")).toEqual([
      { source: "official", created_at: TIME, deleted_at: null },
      { source: "official", created_at: TIME, deleted_at: null },
    ]);
    expect(conn.all("SELECT DISTINCT dataset_id FROM timetable")).toEqual([{ dataset_id: report.datasetId }]);
    expect(conn.all("SELECT name, official_key FROM season")).toEqual([
      { name: "07-01 a 08-31 (exclude)", official_key: "mobilis/season/07-01-08-31-exclude" },
    ]);
    expect(conn.all("SELECT official_key FROM day_type ORDER BY sort")).toEqual([
      { official_key: "mobilis/day_type/weekday" }, { official_key: "mobilis/day_type/saturday" }, { official_key: "mobilis/day_type/sunday_holiday" },
    ]);
  });

  it("avisa o progresso, tabela por tabela", async () => {
    const conn = await setup();
    const seen: string[] = [];
    await importMobilis(conn, exampleSeed(), { now, onProgress: (p) => seen.push(`${p.step}/${p.of} ${p.table}`) });
    expect(seen).toHaveLength(12);
    expect(seen[0]).toBe("1/12 network");
    expect(seen[11]).toBe("12/12 stop_time");
  });

  it("importar duas vezes: mesmas contagens, nada alterado, dataset não duplica", async () => {
    const conn = await setup();
    await importMobilis(conn, exampleSeed(), { now });
    const before = snapshot(conn);
    const report = await importMobilis(conn, exampleSeed(), { now: () => TIME + 60_000 });

    expect(snapshot(conn)).toEqual(before);
    expect(report.newDataset).toBe(false);
    expect(Object.values(report.tables).every((t) => t.inserted === 0)).toBe(true);
    expect(report.tables.stop).toEqual({ total: 3, inserted: 0 });
  });

  it("vigência nova acrescenta sem apagar a antiga e reaproveita as paragens", async () => {
    const conn = await setup();
    await importMobilis(conn, exampleSeed("2026-09-01"), { now });
    const before = snapshot(conn);
    const report = await importMobilis(conn, exampleSeed("2027-03-01", true), { now: () => TIME + 1000 });

    // 2026 intacto
    for (const [table, rows] of Object.entries(before)) {
      const after = new Map(snapshot(conn, [table])[table]!.map((r) => [r.id, r]));
      for (const row of rows) expect(after.get(row.id), `${table}/${row.id}`).toEqual(row);
    }
    // acrescentou: 1 percurso, 3 paragens de percurso, 1 quadro, 2 viagens, 6 horários, 1 dataset; 1 paragem nova; linha reaproveitada
    expect(counts(conn)).toMatchObject({
      dataset: 2, line: 1, stop: 4, pattern: 2, pattern_stop: 6, timetable: 2, trip: 4, trip_day_type: 6, stop_time: 12,
      day_type: 3, season: 1, network: 1,
    });
    expect(report.tables.stop).toEqual({ total: 4, inserted: 1 });
    expect(report.tables.line).toEqual({ total: 1, inserted: 0 });
    expect(report.newDataset).toBe(true);
    expect(danglingRefs(conn)).toEqual([]);
    expect(conn.all("SELECT valid_from FROM timetable ORDER BY valid_from")).toEqual([
      { valid_from: "2026-09-01" }, { valid_from: "2027-03-01" },
    ]);
  });

  it("falha no meio: o banco fica igual ao de antes (vazio, e depois com a vigência anterior)", async () => {
    const conn = await setup();
    const empty = snapshot(conn);
    for (const nth of [1, 5, 12, 26]) {
      await expect(importMobilis(failingOn(conn, nth), exampleSeed(), { now })).rejects.toThrow("falha forçada");
      expect(snapshot(conn), `falha na gravação ${nth}`).toEqual(empty);
    }

    await importMobilis(conn, exampleSeed("2026-09-01"), { now });
    const v2026 = snapshot(conn);
    await expect(importMobilis(failingOn(conn, 20), exampleSeed("2027-03-01", true), { now })).rejects.toThrow("falha forçada");
    expect(snapshot(conn)).toEqual(v2026);
    // e a conexão continua usável: a importação seguinte funciona
    await importMobilis(conn, exampleSeed("2027-03-01", true), { now });
    expect(counts(conn).trip).toBe(4);
  });

  it("arquivo inválido falha sem tocar no banco", async () => {
    const conn = await setup();
    const before = snapshot(conn);
    const bad = (mutate: (s: ReturnType<typeof exampleSeed>) => void) => {
      const s = structuredClone(exampleSeed());
      mutate(s);
      return s;
    };
    const cases: [string, unknown][] = [
      ["não é objeto", [1, 2]],
      ["sem lista", { format: "notebus.mobilis-seed", formatVersion: 1 }],
      ["formato errado", bad((s) => { (s as { format: string }).format = "outro"; })],
      ["horário como texto", bad((s) => { (s.stopTimes[0] as { serviceMinute: unknown }).serviceMinute = "08:10"; })],
      ["tipo de dia desconhecido", bad((s) => { (s.trips[0] as { dayTypes: unknown }).dayTypes = ["feriado"]; })],
      ["referência solta", bad((s) => { s.stopTimes[0]!.tripId = "inexistente"; })],
      ["ID que não é o da chave", bad((s) => { s.stops[0]!.key = "mobilis/stop/9999"; })],
    ];
    for (const [name, json] of cases) {
      await expect(importMobilis(conn, json, { now }), name).rejects.toBeInstanceOf(SeedFormatError);
      expect(snapshot(conn), name).toEqual(before);
    }
  });

  it("registro do usuário sobrevive: a observação continua e aponta para a mesma paragem", async () => {
    const conn = await setup();
    await importMobilis(conn, exampleSeed(), { now });
    const stop = conn.all("SELECT id FROM stop WHERE external_id = '9001'")[0]!.id as string;
    const line = conn.all("SELECT id FROM line")[0]!.id as string;
    conn.db.exec(
      `INSERT INTO observation (id, created_at, updated_at, source, stop_id, line_id, observed_at, kind, mode, recorded_at) VALUES ('obs', 1, 1, 'user', '${stop}', '${line}', ${TIME}, 'boarded', 'live', ${TIME})`,
    );
    const obs = snapshot(conn, ["observation"]);

    await importMobilis(conn, exampleSeed(), { now: () => TIME + 1 });
    await importMobilis(conn, exampleSeed("2027-03-01", true), { now: () => TIME + 2 });

    expect(snapshot(conn, ["observation"])).toEqual(obs);
    expect(conn.all("SELECT o.id FROM observation o JOIN stop s ON s.id = o.stop_id WHERE s.id = ?", [stop])).toEqual([{ id: "obs" }]);
  });

  it("nunca apaga nem desfaz exclusão: o que sumiu do arquivo novo e o que o usuário apagou ficam como estão", async () => {
    const conn = await setup();
    await importMobilis(conn, exampleSeed("2026-09-01"), { now });
    conn.db.exec(`UPDATE stop SET deleted_at = ${TIME}, source = 'official_edited', name = 'Meu nome' WHERE external_id = '9001'`);
    const stop = snapshot(conn, ["stop"]);

    await importMobilis(conn, exampleSeed("2027-03-01"), { now: () => TIME + 1 });

    const after = snapshot(conn, ["stop"]).stop!;
    for (const row of stop.stop!) expect(after).toContainEqual(row);
    expect(conn.all("SELECT COUNT(*) AS n FROM trip")[0]!.n).toBe(4); // as de 2026 não saíram
  });
});

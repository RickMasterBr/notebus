/// <reference types="node" />
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateProtected } from "./migrate";
import { migrations } from "./migrations";
import { NodeSqlite, nodeBackupStore } from "./testing/nodeSqlite";
import { buildTestSeedSql, isTestSeedEnabled, seedTestDatabase } from "./testSeed";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "notebus-test-seed-"));
  const conn = new NodeSqlite(join(dir, "notebus.db"));
  const backupDir = join(dir, "backups");
  const backups = nodeBackupStore(conn, backupDir);
  return { conn, backups, dir };
}

describe("testSeed (E-09 §3.4, T-92 a T-94)", () => {
  it("importa a rede mínima inventada de forma idempotente com node:sqlite", async () => {
    const { conn, backups } = setup();

    // 1. Executa as migrações para criar o esquema completo
    await migrateProtected({
      db: conn,
      backups,
      migrations,
    });

    // 2. Executa a importação do testSeed
    await seedTestDatabase({
      exec: (sql) => conn.exec(sql),
    });

    // 3. Verifica os 3 pontos obrigatórios
    const stops = conn.all("SELECT name, lat, lon FROM stop ORDER BY name") as {
      name: string;
      lat: number;
      lon: number;
    }[];
    expect(stops).toHaveLength(3);
    const stopNames = stops.map((s) => s.name);
    expect(stopNames).toEqual(["Arrabalde", "Casa", "Facul"]);

    // 4. Verifica 1 linha e 1 percurso
    const lines = conn.all("SELECT code, name, color FROM line") as {
      code: string;
      name: string;
      color: string;
    }[];
    expect(lines).toHaveLength(1);
    expect(lines[0]!.code).toBe("1");
    expect(lines[0]!.name).toBe("Linha 1");

    const patterns = conn.all("SELECT id, line_id FROM pattern");
    expect(patterns).toHaveLength(1);

    const patternStops = conn.all(
      "SELECT position, stop_id FROM pattern_stop ORDER BY position",
    );
    expect(patternStops).toHaveLength(3);

    // 5. Verifica viagens e horários
    const trips = conn.all("SELECT id FROM trip");
    expect(trips.length).toBeGreaterThan(0);

    const stopTimes = conn.all("SELECT id FROM stop_time");
    expect(stopTimes.length).toBeGreaterThan(0);

    // 6. Verifica atalhos e trajetos
    const places = conn.all(
      "SELECT name, is_shortcut, shortcut_order FROM place ORDER BY name",
    ) as { name: string; is_shortcut: number; shortcut_order: number }[];
    expect(places).toHaveLength(2);
    expect(places.map((p) => p.name)).toEqual(["Casa", "Facul"]);
    const facul = places.find((p) => p.name === "Facul");
    expect(facul?.is_shortcut).toBe(1);

    const routes = conn.all("SELECT id FROM route");
    expect(routes).toHaveLength(1);

    const options = conn.all("SELECT id, kind FROM option");
    expect(options).toHaveLength(1);
    expect((options[0] as any).kind).toBe("bus");

    // 7. Verifica settings (primeiro uso concluído e recente)
    const settings = conn.all("SELECT key, value FROM setting") as {
      key: string;
      value: string;
    }[];
    const firstRun = settings.find((s) => s.key === "first_run_done");
    expect(firstRun).toBeDefined();

    const recent = settings.find((s) => s.key === "recent_stops");
    expect(recent).toBeDefined();
    expect(recent?.value).toContain("seed-stop-arrabalde");

    // 8. Garante que nada da MOBILIS foi incluído (D-091)
    const allSql = buildTestSeedSql().join("\n");
    expect(allSql.toLowerCase()).not.toContain("mobilis");
    expect(allSql.toLowerCase()).not.toContain("leiria");

    // 9. Prova de Idempotência: rodar novamente não duplica nem lança erro
    const stopsBefore = conn.all("SELECT count(*) as c FROM stop")[0]!.c;
    const tripsBefore = conn.all("SELECT count(*) as c FROM trip")[0]!.c;
    const linesBefore = conn.all("SELECT count(*) as c FROM line")[0]!.c;

    await seedTestDatabase({
      exec: (sql) => conn.exec(sql),
    });

    const stopsAfter = conn.all("SELECT count(*) as c FROM stop")[0]!.c;
    const tripsAfter = conn.all("SELECT count(*) as c FROM trip")[0]!.c;
    const linesAfter = conn.all("SELECT count(*) as c FROM line")[0]!.c;

    expect(stopsAfter).toBe(stopsBefore);
    expect(tripsAfter).toBe(tripsBefore);
    expect(linesAfter).toBe(linesBefore);
  });

  it("isTestSeedEnabled respeita EXPO_PUBLIC_NB_TEST_SEED", () => {
    const prev = process.env.EXPO_PUBLIC_NB_TEST_SEED;
    try {
      delete process.env.EXPO_PUBLIC_NB_TEST_SEED;
      expect(isTestSeedEnabled()).toBe(false);

      process.env.EXPO_PUBLIC_NB_TEST_SEED = "1";
      expect(isTestSeedEnabled()).toBe(true);

      process.env.EXPO_PUBLIC_NB_TEST_SEED = "0";
      expect(isTestSeedEnabled()).toBe(false);
    } finally {
      if (prev !== undefined) {
        process.env.EXPO_PUBLIC_NB_TEST_SEED = prev;
      } else {
        delete process.env.EXPO_PUBLIC_NB_TEST_SEED;
      }
    }
  });
});

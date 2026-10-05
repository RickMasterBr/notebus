import { describe, expect, it } from "vitest";
import { BACKUP_TABLES, parseBackup, serializeBackup } from "@notebus/domain";
import { createPlaces, reorder } from "./places";
import { prepareImport } from "../data/backupFlow";
import { testDbWithSqlite } from "./testing/drizzleTestDb";
import { importMobilis } from "./importMobilis";
import { exampleSeed } from "./testing/exampleSeed";
import { patternStop, stop } from "./schema";
import { createHash } from "node:crypto";
import { readBackupInput, importBackup } from "./backup";
import type { BackupStore } from "./migrate";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function memoryBackups(): BackupStore & { names: string[] } {
  const names: string[] = [];
  return {
    names,
    create: async (name) => void names.push(name),
    restore: async () => {},
    list: async () => [...names],
    remove: async (name) => void names.splice(names.indexOf(name), 1),
  };
}

const T0 = 1_790_000_000_000;

async function setupTestDb() {
  const { db, sqlite } = testDbWithSqlite();
  // Importa a rede sintética do exampleSeed
  const seed = exampleSeed("2026-09-01");
  const importDb = {
    exec: async (s: string) => { sqlite.exec(s); },
    run: async (s: string, p: (string | number | null)[] = []) => {
      const res = sqlite.prepare(s).run(...(p as never[]));
      return { changes: Number(res.changes) };
    },
    all: async (s: string, p: (string | number | null)[] = []) => {
      return sqlite.prepare(s).all(...(p as never[])) as Record<string, unknown>[];
    },
    userVersion: async () => 1,
  };
  await importMobilis(importDb, seed, { now: () => T0 });
  const placesRepo = createPlaces(db);
  return { db, sqlite, importDb, placesRepo };
}

describe("reorder (função pura de reordenação)", () => {
  it("move item para frente", () => {
    expect(reorder(["A", "B", "C", "D"], 0, 2)).toEqual(["B", "C", "A", "D"]);
  });

  it("move item para trás", () => {
    expect(reorder(["A", "B", "C", "D"], 3, 1)).toEqual(["A", "D", "B", "C"]);
  });

  it("índice igual ou inválido devolve cópia idêntica", () => {
    expect(reorder(["A", "B"], 0, 0)).toEqual(["A", "B"]);
    expect(reorder(["A", "B"], -1, 1)).toEqual(["A", "B"]);
    expect(reorder(["A", "B"], 0, 5)).toEqual(["A", "B"]);
  });
});

describe("Item 1: Lugares e atalhos", () => {
  it("criar lugar: atalho novo entra no fim; não-atalho tem shortcutOrder nulo", async () => {
    const { placesRepo } = await setupTestDb();

    const casa = await placesRepo.createPlace({ name: "Casa", isShortcut: true }, T0);
    expect(casa.shortcutOrder).toBe(0);

    const facul = await placesRepo.createPlace({ name: "Facul", isShortcut: true }, T0 + 1000);
    expect(facul.shortcutOrder).toBe(1);

    const mercado = await placesRepo.createPlace({ name: "Mercado", isShortcut: false }, T0 + 2000);
    expect(mercado.shortcutOrder).toBeNull();

    const academia = await placesRepo.createPlace({ name: "Academia", isShortcut: true }, T0 + 3000);
    expect(academia.shortcutOrder).toBe(2);

    const shortcuts = await placesRepo.listShortcuts();
    expect(shortcuts.map((p) => p.name)).toEqual(["Casa", "Facul", "Academia"]);
  });

  it("editar lugar: updated_at só muda quando algo mudou de verdade", async () => {
    const { placesRepo } = await setupTestDb();
    const lugar = await placesRepo.createPlace({ name: "Casa", icon: "house", isShortcut: false }, T0);

    // Sem mudança: updated_at não muda
    const mesmo = await placesRepo.updatePlace(lugar.id, { name: "Casa" }, T0 + 5000);
    expect(mesmo.updatedAt).toBe(T0);

    // Com mudança real: updated_at atualizado
    const atualizado = await placesRepo.updatePlace(lugar.id, { name: "Casa Nova" }, T0 + 10_000);
    expect(atualizado.updatedAt).toBe(T0 + 10_000);
    expect(atualizado.name).toBe("Casa Nova");

    // Virando atalho: entra no fim
    const viraAtalho = await placesRepo.updatePlace(lugar.id, { isShortcut: true }, T0 + 15_000);
    expect(viraAtalho.isShortcut).toBe(true);
    expect(viraAtalho.shortcutOrder).toBe(0);

    // Deixando de ser atalho: shortcutOrder vira nulo
    const saiAtalho = await placesRepo.updatePlace(lugar.id, { isShortcut: false }, T0 + 20_000);
    expect(saiAtalho.isShortcut).toBe(false);
    expect(saiAtalho.shortcutOrder).toBeNull();
  });

  it("reordenar atalhos: regrava a ordem e só atualiza updated_at de quem mudou", async () => {
    const { placesRepo } = await setupTestDb();
    const p1 = await placesRepo.createPlace({ name: "A", isShortcut: true }, T0);
    const p2 = await placesRepo.createPlace({ name: "B", isShortcut: true }, T0);
    const p3 = await placesRepo.createPlace({ name: "C", isShortcut: true }, T0);

    // Inverte p1 e p2; p3 continua na posição 2
    await placesRepo.reorderShortcuts([p2.id, p1.id, p3.id], T0 + 10_000);

    const sc = await placesRepo.listShortcuts();
    expect(sc.map((p) => p.name)).toEqual(["B", "A", "C"]);

    const p3After = await placesRepo.getPlace(p3.id);
    expect(p3After!.updatedAt).toBe(T0); // Não mudou de posição

    const p1After = await placesRepo.getPlace(p1.id);
    expect(p1After!.updatedAt).toBe(T0 + 10_000);
  });
});

describe("Item 1: Trajetos", () => {
  it("ensureRoute nasce com a primeira chamada e é idempotente", async () => {
    const { placesRepo } = await setupTestDb();
    const casa = await placesRepo.createPlace({ name: "Casa" }, T0);
    const facul = await placesRepo.createPlace({ name: "Facul" }, T0);

    const r1 = await placesRepo.ensureRoute(casa.id, facul.id, T0 + 1000);
    expect(r1.originPlaceId).toBe(casa.id);
    expect(r1.destinationPlaceId).toBe(facul.id);

    // Segunda chamada retorna o mesmo trajeto existente
    const r2 = await placesRepo.ensureRoute(casa.id, facul.id, T0 + 2000);
    expect(r2.id).toBe(r1.id);
    expect(r2.createdAt).toBe(r1.createdAt);

    const todos = await placesRepo.listRoutesTo(facul.id);
    expect(todos).toHaveLength(1);
    expect(todos[0]!.id).toBe(r1.id);
  });
});

describe("Item 1, T-47: Tempo a pé compartilhado por par ponto ↔ lugar", () => {
  it("T-47: Castelo ↔ Casa usado em dois trajetos; mudar de 10–12 para 10–14 numa opção muda nos dois; sentido contrário lê o mesmo", async () => {
    const { placesRepo, db } = await setupTestDb();
    const casa = await placesRepo.createPlace({ name: "Casa" }, T0);
    const facul = await placesRepo.createPlace({ name: "Facul" }, T0);

    // Ponto Castelo do seed
    const allStops = await db.select().from(stop);
    const casteloStopId = allStops[0]!.id;

    // Define 10 a 12 min entre Castelo e Casa
    const wt = await placesRepo.setWalkTime(casteloStopId, casa.id, { minutesMin: 10, minutesMax: 12 }, T0);
    expect([wt.minutesMin, wt.minutesMax]).toEqual([10, 12]);

    // Consultando o par devolve 10–12
    const read1 = await placesRepo.getWalkTime(casteloStopId, casa.id);
    expect([read1!.minutesMin, read1!.minutesMax]).toEqual([10, 12]);

    // Mudar para 10–14 atualiza a mesma linha
    const wtUpdated = await placesRepo.setWalkTime(casteloStopId, casa.id, { minutesMin: 10, minutesMax: 14 }, T0 + 5000);
    expect([wtUpdated.minutesMin, wtUpdated.minutesMax]).toEqual([10, 14]);
    expect(wtUpdated.id).toBe(wt.id);

    // Trajeto inverso: leitura pelo mesmo par ponto e lugar devolve 10–14
    const readInverso = await placesRepo.getWalkTime(casteloStopId, casa.id);
    expect([readInverso!.minutesMin, readInverso!.minutesMax]).toEqual([10, 14]);

    // Garante que só existe 1 única linha no banco para o par
    const rows = (await placesRepo.loadAll()).walkTimes.filter(
      (w) => w.stopId === casteloStopId && w.placeId === casa.id,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("Item 1: Opções de ônibus e a pé", () => {
  it("adicionar opção de ônibus valida checkBusOption (descida depois do embarque); recusa se inválida", async () => {
    const { placesRepo, db } = await setupTestDb();
    const casa = await placesRepo.createPlace({ name: "Casa" }, T0);
    const facul = await placesRepo.createPlace({ name: "Facul" }, T0);
    const route = await placesRepo.ensureRoute(casa.id, facul.id, T0);

    const pst = await db.select().from(patternStop);
    const psPos1 = pst.find((p) => p.position === 1)!;
    const psPos2 = pst.find((p) => p.position === 2)!;
    const psPos3 = pst.find((p) => p.position === 3)!;

    // Válido: embarque na pos 1, descida na pos 2
    const optBus = await placesRepo.addOption(
      {
        kind: "bus",
        routeId: route.id,
        boardPatternStopId: psPos1.id,
        alightPatternStopId: psPos2.id,
      },
      T0 + 1000,
    );
    expect(optBus.kind).toBe("bus");
    expect(optBus.boardPatternStopId).toBe(psPos1.id);
    expect(optBus.alightPatternStopId).toBe(psPos2.id);

    // Inválido: descida na mesma posição
    await expect(
      placesRepo.addOption(
        {
          kind: "bus",
          routeId: route.id,
          boardPatternStopId: psPos1.id,
          alightPatternStopId: psPos1.id,
        },
        T0 + 2000,
      ),
    ).rejects.toThrow(/descida não vem depois do embarque/);

    // Inválido: descida antes do embarque
    await expect(
      placesRepo.addOption(
        {
          kind: "bus",
          routeId: route.id,
          boardPatternStopId: psPos3.id,
          alightPatternStopId: psPos1.id,
        },
        T0 + 2000,
      ),
    ).rejects.toThrow(/descida não vem depois do embarque/);
  });

  it("opção a pé, apagar com Desfazer e reordenar", async () => {
    const { placesRepo } = await setupTestDb();
    const casa = await placesRepo.createPlace({ name: "Casa" }, T0);
    const facul = await placesRepo.createPlace({ name: "Facul" }, T0);
    const route = await placesRepo.ensureRoute(casa.id, facul.id, T0);

    const optWalk = await placesRepo.addOption(
      { kind: "walk", routeId: route.id, walkMinutes: 45 },
      T0 + 1000,
    );
    expect(optWalk.walkMinutes).toBe(45);

    let list = await placesRepo.listOptions(route.id);
    expect(list).toHaveLength(1);

    // Apagar com token
    const { token } = await placesRepo.removeOption(optWalk.id, T0 + 2000);
    list = await placesRepo.listOptions(route.id);
    expect(list).toHaveLength(0);

    // Desfazer
    await placesRepo.restoreOption(token, T0 + 3000);
    list = await placesRepo.listOptions(route.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(optWalk.id);
  });
});

describe("Item 1, A11 por teste: ida e volta do backup de lugares, trajetos, opções e tempos a pé", () => {
  it("A11: exportar banco com lugares/trajetos/opções/walk_time e importar em banco vazio traz tudo igual", async () => {
    const { placesRepo: srcPlaces, importDb: srcImportDb, db: srcDb } = await setupTestDb();

    // Cria lugares
    const casa = await srcPlaces.createPlace({ name: "Casa", icon: "house", isShortcut: true, lat: 39.74, lon: -8.80 }, T0);
    const facul = await srcPlaces.createPlace({ name: "Facul", icon: "school", isShortcut: true }, T0 + 100);

    // Cria trajeto
    const r = await srcPlaces.ensureRoute(casa.id, facul.id, T0 + 200);

    // Cria tempo a pé
    const pst = await srcDb.select().from(patternStop);
    const ps1 = pst.find((p) => p.position === 1)!;
    const ps3 = pst.find((p) => p.position === 3)!;
    const wt = await srcPlaces.setWalkTime(ps1.stopId, casa.id, { minutesMin: 8, minutesMax: 10 }, T0 + 300);

    // Cria opções (ônibus e a pé)
    const oBus = await srcPlaces.addOption({ kind: "bus", routeId: r.id, boardPatternStopId: ps1.id, alightPatternStopId: ps3.id }, T0 + 400);
    const oWalk = await srcPlaces.addOption({ kind: "walk", routeId: r.id, walkMinutes: 50 }, T0 + 500);

    // Exporta o backup
    const backupInput = await readBackupInput(srcImportDb, { now: T0 + 1000, appVersion: "1.0.0" });
    const backupText = await serializeBackup(backupInput, sha256);

    // Importa num banco novo vazio com a mesma seed
    const { placesRepo: dstPlaces, importDb: dstImportDb } = await setupTestDb();

    const preview = await prepareImport(dstImportDb, backupText, sha256);
    expect(preview.ok).toBe(true);
    if (!preview.ok) throw new Error("backup inválido");

    await importBackup(dstImportDb, preview.file, {
      backups: memoryBackups(),
      now: T0 + 2000,
    });

    // Confere que place, route, option e walk_time voltam idênticos
    const dstData = await dstPlaces.loadAll();
    const srcData = await srcPlaces.loadAll();

    expect(dstData.places.map((p) => ({ id: p.id, name: p.name, isShortcut: p.isShortcut, shortcutOrder: p.shortcutOrder, lat: p.lat, lon: p.lon })))
      .toEqual(srcData.places.map((p) => ({ id: p.id, name: p.name, isShortcut: p.isShortcut, shortcutOrder: p.shortcutOrder, lat: p.lat, lon: p.lon })));

    expect(dstData.routes.map((x) => ({ id: x.id, originPlaceId: x.originPlaceId, destinationPlaceId: x.destinationPlaceId })))
      .toEqual(srcData.routes.map((x) => ({ id: x.id, originPlaceId: x.originPlaceId, destinationPlaceId: x.destinationPlaceId })));

    expect(dstData.walkTimes.map((w) => ({ id: w.id, stopId: w.stopId, placeId: w.placeId, min: w.minutesMin, max: w.minutesMax })))
      .toEqual(srcData.walkTimes.map((w) => ({ id: w.id, stopId: w.stopId, placeId: w.placeId, min: w.minutesMin, max: w.minutesMax })));

    expect(dstData.options.map((o) => ({ id: o.id, routeId: o.routeId, kind: o.kind, board: o.boardPatternStopId, alight: o.alightPatternStopId, walk: o.walkMinutes, sort: o.sort })))
      .toEqual(srcData.options.map((o) => ({ id: o.id, routeId: o.routeId, kind: o.kind, board: o.boardPatternStopId, alight: o.alightPatternStopId, walk: o.walkMinutes, sort: o.sort })));
  });
});

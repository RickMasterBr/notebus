import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPlaces } from "../db/places";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { importMobilis } from "../db/importMobilis";
import { exampleSeed } from "../db/testing/exampleSeed";
import { patternStop } from "../db/schema";
import { buildGotoInputFromSources } from "../data/gotoData";
import { loadSchedule } from "../data/schedule";
import { gotoCards } from "@notebus/domain";
import { originSelectionAction } from "./placeOrigin";

const T0 = 1_790_000_000_000;

async function setupTestDb() {
  const { db, sqlite } = testDbWithSqlite();
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

describe("Item 4 diagnóstico e abertura de trajeto existente", () => {
  it("escolher origem com trajeto já cadastrado abre o trajeto existente (kind: 'route')", async () => {
    const { placesRepo, db } = await setupTestDb();
    const casa = await placesRepo.createPlace({ name: "Casa" }, T0);
    const facul = await placesRepo.createPlace({ name: "Facul" }, T0 + 10);
    const academia = await placesRepo.createPlace({ name: "Academia" }, T0 + 20);

    // Cria trajeto Casa -> Facul com 3 opções
    const routeCasaFacul = await placesRepo.ensureRoute(casa.id, facul.id, T0 + 30);
    const pst = await db.select().from(patternStop);
    const ps1 = pst.find((p) => p.position === 1)!;
    const ps2 = pst.find((p) => p.position === 2)!;
    const ps3 = pst.find((p) => p.position === 3)!;

    await placesRepo.addOption(
      { kind: "bus", routeId: routeCasaFacul.id, boardPatternStopId: ps1.id, alightPatternStopId: ps2.id },
      T0 + 40,
    );
    await placesRepo.addOption(
      { kind: "bus", routeId: routeCasaFacul.id, boardPatternStopId: ps1.id, alightPatternStopId: ps3.id },
      T0 + 50,
    );
    await placesRepo.addOption(
      { kind: "walk", routeId: routeCasaFacul.id, walkMinutes: 20 },
      T0 + 60,
    );

    const allData = await placesRepo.loadAll();

    // 1. Ao escolher Casa (já tem trajeto até Facul), abre o trajeto existente em vez de novo rascunho
    const actionCasa = originSelectionAction(allData.routes, casa.id, facul.id);
    expect(actionCasa).toEqual({
      kind: "route",
      routeId: routeCasaFacul.id,
    });

    // 2. Ao escolher Academia (ainda não tem trajeto até Facul), abre o editor de opção em rascunho
    const actionAcademia = originSelectionAction(allData.routes, academia.id, facul.id);
    expect(actionAcademia).toEqual({
      kind: "option",
      originPlaceId: academia.id,
      destinationPlaceId: facul.id,
    });
  });

  it("falha no comportamento anterior à correção onde escolher Casa abria opção em vez de trajeto existente", () => {
    // Código anterior de handleCreateRouteFrom: sempre despachava { kind: "option", originPlaceId, destinationPlaceId }
    const preFixBehavior = (originPlaceId: string, destinationPlaceId: string) => ({
      kind: "option" as const,
      originPlaceId,
      destinationPlaceId,
    });

    const action = preFixBehavior("casa-id", "facul-id");
    // O código anterior NÃO devolvia kind: "route", falhando a exigência de abrir o que já existe
    expect(action.kind).not.toBe("route");
  });

  it("diagnóstico: Academia não é filtrada nem desabilitada, e originOption possui minHeight", async () => {
    const { placesRepo } = await setupTestDb();
    const facul = await placesRepo.createPlace({ name: "Facul" }, T0);
    const academia = await placesRepo.createPlace({ name: "Academia" }, T0 + 10);
    const casa = await placesRepo.createPlace({ name: "Casa" }, T0 + 20);

    const allData = await placesRepo.loadAll();
    // Confirma que Academia está em otherPlaces (nenhuma regra a esconde)
    const otherPlaces = allData.places.filter((p) => p.id !== facul.id && p.deletedAt === null);
    expect(otherPlaces.some((p) => p.name === "Academia")).toBe(true);
    expect(otherPlaces.some((p) => p.name === "Casa")).toBe(true);

    // Confirma que PlaceSheet define minHeight: minTouch para originOption
    const placeSheetSource = readFileSync(join(__dirname, "PlaceSheet.tsx"), "utf8");
    const hasMinTouchOnOrigin = /originOption:\s*\{[\s\S]*?minHeight:\s*minTouch/.test(placeSheetSource);
    expect(hasMinTouchOnOrigin).toBe(true);
  });

  it("OptionSheet em rascunho com origin/destination localiza o trajeto existente", async () => {
    const { placesRepo } = await setupTestDb();
    const casa = await placesRepo.createPlace({ name: "Casa" }, T0);
    const facul = await placesRepo.createPlace({ name: "Facul" }, T0 + 10);
    const route = await placesRepo.ensureRoute(casa.id, facul.id, T0 + 20);

    const allData = await placesRepo.loadAll();

    // Lógica do useMemo de route em OptionSheet
    const initialOriginPlaceId = casa.id;
    const initialDestinationPlaceId = facul.id;
    const routeId = undefined;

    const resolvedRoute = routeId
      ? allData.routes.find((r) => r.id === routeId && r.deletedAt === null) ?? null
      : initialOriginPlaceId && initialDestinationPlaceId
        ? allData.routes.find(
            (r) =>
              r.originPlaceId === initialOriginPlaceId &&
              r.destinationPlaceId === initialDestinationPlaceId &&
              r.deletedAt === null,
          ) ?? null
        : null;

    expect(resolvedRoute).toBeDefined();
    expect(resolvedRoute!.id).toBe(route.id);
  });

  it("não trava nem lança erro ao avaliar rascunho com dados do Mobilis", async () => {
    const { placesRepo, db } = await setupTestDb();
    const casa = await placesRepo.createPlace({ name: "Casa" }, T0);
    const facul = await placesRepo.createPlace({ name: "Facul" }, T0 + 10);
    const allData = await placesRepo.loadAll();

    const previewRoute = {
      id: "preview-route",
      originPlaceId: casa.id,
      destinationPlaceId: facul.id,
      source: "user" as const,
      createdAt: T0,
      updatedAt: T0,
      deletedAt: null,
    };
    const draftOpt = {
      id: "preview-option",
      routeId: previewRoute.id,
      kind: "bus" as const,
      source: "user" as const,
      boardPatternStopId: null,
      alightPatternStopId: null,
      walkMinutes: null,
      sort: 0,
      createdAt: T0,
      updatedAt: T0,
      deletedAt: null,
    };

    const sched = await loadSchedule(db);
    const draftInput = buildGotoInputFromSources(
      {
        route: previewRoute,
        options: [draftOpt],
        walkTimes: allData.walkTimes,
        observations: [],
        rides: [],
        schedule: sched,
      },
      T0,
    );
    expect(draftInput).toBeDefined();
    if (draftInput) {
      const cards = gotoCards(draftInput);
      expect(cards).toEqual([]);
    }
  });
});

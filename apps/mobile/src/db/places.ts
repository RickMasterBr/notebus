/**
 * Lugares, trajetos, opções e tempo a pé (E-05 §4.1, D-063, D-069, D-087).
 *
 * Padrão do `registro.ts`:
 * - Uma transação por operação gravada (`inTransaction`).
 * - Fila para uma gravação por vez (`enqueue`).
 * - IDs `uuidv7` do domínio.
 * - `updated_at` só muda quando algo mudou de verdade.
 * - Soft-delete para opções (`deletedAt`), com token para Desfazer.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { checkBusOption, uuidv7 } from "@notebus/domain";
import { selectLive } from "./query";
import { option, patternStop, place, route, walkTime } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export type PlaceRow = typeof place.$inferSelect;
export type RouteRow = typeof route.$inferSelect;
export type OptionRow = typeof option.$inferSelect;
export type WalkTimeRow = typeof walkTime.$inferSelect;

export interface PlacesDeps {
  newId?: (now: number) => string;
}

export interface CreatePlaceInput {
  name: string;
  icon?: string | null;
  isShortcut?: boolean;
  lat?: number | null;
  lon?: number | null;
}

export interface UpdatePlacePatch {
  name?: string;
  icon?: string | null;
  isShortcut?: boolean;
  lat?: number | null;
  lon?: number | null;
}

export interface SetWalkTimeInput {
  minutesMin: number;
  minutesMax?: number | null;
}

export type AddOptionInput =
  | {
      kind: "bus";
      routeId: string;
      boardPatternStopId: string;
      alightPatternStopId: string;
    }
  | {
      kind: "walk";
      routeId: string;
      walkMinutes: number;
    };

export interface UpdateOptionPatch {
  boardPatternStopId?: string;
  alightPatternStopId?: string;
  walkMinutes?: number | null;
}

export interface OptionToken {
  option: OptionRow;
}

/**
 * Função pura para reordenar uma lista movendo o item de `from` para `to`.
 */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return [...list];
  if (from === to) return [...list];
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

export function createPlaces(db: AnyDb, deps: PlacesDeps = {}) {
  const newId = deps.newId ?? ((now: number) => uuidv7(now));
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  }

  async function inTransaction<T>(body: () => Promise<T>): Promise<T> {
    await db.run(sql`begin immediate`);
    try {
      const result = await body();
      await db.run(sql`commit`);
      return result;
    } catch (error) {
      await db.run(sql`rollback`).catch(() => undefined);
      throw error;
    }
  }

  // ─── Lugares ─────────────────────────────────────────────────────────────

  async function getPlace(id: string): Promise<PlaceRow | null> {
    const rows = await selectLive(db, place);
    return rows.find((p) => p.id === id) ?? null;
  }

  async function listPlaces(): Promise<PlaceRow[]> {
    const rows = await selectLive(db, place);
    return [...rows].sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }

  async function listShortcuts(): Promise<PlaceRow[]> {
    const rows = await selectLive(db, place);
    return rows
      .filter((p) => p.isShortcut)
      .sort((a, b) => (a.shortcutOrder ?? 0) - (b.shortcutOrder ?? 0));
  }

  function createPlace(input: CreatePlaceInput, at: number): Promise<PlaceRow> {
    return enqueue(() =>
      inTransaction(async () => {
        const id = newId(at);
        const isShortcut = input.isShortcut === true;
        let shortcutOrder: number | null = null;
        if (isShortcut) {
          const current = await listShortcuts();
          const maxOrder = current.reduce((max, p) => Math.max(max, p.shortcutOrder ?? 0), -1);
          shortcutOrder = maxOrder + 1;
        }

        const newRow: PlaceRow = {
          id,
          name: input.name.trim(),
          icon: input.icon ?? null,
          lat: input.lat ?? null,
          lon: input.lon ?? null,
          isShortcut,
          shortcutOrder,
          source: "user",
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        };

        await db.insert(place).values(newRow);
        return newRow;
      }),
    );
  }

  function updatePlace(id: string, patch: UpdatePlacePatch, at: number): Promise<PlaceRow> {
    return enqueue(() =>
      inTransaction(async () => {
        const existing = await getPlace(id);
        if (!existing) throw new Error("lugar não encontrado");

        const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
        const nextIcon = patch.icon !== undefined ? patch.icon : existing.icon;
        const nextLat = patch.lat !== undefined ? patch.lat : existing.lat;
        const nextLon = patch.lon !== undefined ? patch.lon : existing.lon;
        const nextIsShortcut = patch.isShortcut !== undefined ? patch.isShortcut : existing.isShortcut;

        let nextShortcutOrder = existing.shortcutOrder;
        if (!existing.isShortcut && nextIsShortcut) {
          const current = await listShortcuts();
          const maxOrder = current.reduce((max, p) => Math.max(max, p.shortcutOrder ?? 0), -1);
          nextShortcutOrder = maxOrder + 1;
        } else if (existing.isShortcut && !nextIsShortcut) {
          nextShortcutOrder = null;
        }

        const changed =
          nextName !== existing.name ||
          nextIcon !== existing.icon ||
          nextLat !== existing.lat ||
          nextLon !== existing.lon ||
          nextIsShortcut !== existing.isShortcut ||
          nextShortcutOrder !== existing.shortcutOrder;

        if (!changed) {
          return existing;
        }

        const updatedRow: PlaceRow = {
          ...existing,
          name: nextName,
          icon: nextIcon,
          lat: nextLat,
          lon: nextLon,
          isShortcut: nextIsShortcut,
          shortcutOrder: nextShortcutOrder,
          updatedAt: at,
        };

        await db.update(place).set(updatedRow).where(eq(place.id, id));
        return updatedRow;
      }),
    );
  }

  function reorderShortcuts(placeIdsInOrder: string[], at: number): Promise<void> {
    return enqueue(() =>
      inTransaction(async () => {
        const current = await listShortcuts();
        const byId = new Map(current.map((p) => [p.id, p]));
        for (let i = 0; i < placeIdsInOrder.length; i++) {
          const pId = placeIdsInOrder[i]!;
          const p = byId.get(pId);
          if (p && p.shortcutOrder !== i) {
            await db.update(place).set({ shortcutOrder: i, updatedAt: at }).where(eq(place.id, pId));
          }
        }
      }),
    );
  }

  // ─── Trajetos ─────────────────────────────────────────────────────────────

  async function getRoute(id: string): Promise<RouteRow | null> {
    const rows = await selectLive(db, route);
    return rows.find((r) => r.id === id) ?? null;
  }

  async function listRoutesTo(destinationPlaceId: string): Promise<RouteRow[]> {
    const rows = await selectLive(db, route);
    return rows.filter((r) => r.destinationPlaceId === destinationPlaceId);
  }

  async function listRoutes(): Promise<RouteRow[]> {
    return selectLive(db, route);
  }

  function ensureRoute(originPlaceId: string, destinationPlaceId: string, at: number): Promise<RouteRow> {
    return enqueue(() =>
      inTransaction(async () => {
        const routes = await selectLive(db, route);
        const existing = routes.find(
          (r) => r.originPlaceId === originPlaceId && r.destinationPlaceId === destinationPlaceId,
        );
        if (existing) return existing;

        const id = newId(at);
        const newRow: RouteRow = {
          id,
          originPlaceId,
          destinationPlaceId,
          source: "user",
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        };
        await db.insert(route).values(newRow);
        return newRow;
      }),
    );
  }

  // ─── Tempo a pé do par (D-069, D-087) ────────────────────────────────────

  async function getWalkTime(stopId: string, placeId: string): Promise<WalkTimeRow | null> {
    const rows = await selectLive(db, walkTime);
    return rows.find((w) => w.stopId === stopId && w.placeId === placeId) ?? null;
  }

  function setWalkTime(stopId: string, placeId: string, input: SetWalkTimeInput, at: number): Promise<WalkTimeRow> {
    return enqueue(() =>
      inTransaction(async () => {
        // Busca existente incluindo apagados para respeitar a chave única do par
        const existingRows = await db
          .select()
          .from(walkTime)
          .where(and(eq(walkTime.stopId, stopId), eq(walkTime.placeId, placeId)));
        const existing = existingRows[0] ?? null;

        const nextMin = input.minutesMin;
        const nextMax = input.minutesMax ?? null;

        if (existing) {
          const changed =
            existing.minutesMin !== nextMin ||
            existing.minutesMax !== nextMax ||
            existing.deletedAt !== null;

          if (!changed) {
            return existing;
          }

          const updated: WalkTimeRow = {
            ...existing,
            minutesMin: nextMin,
            minutesMax: nextMax,
            origin: "manual",
            deletedAt: null,
            updatedAt: at,
          };
          await db.update(walkTime).set(updated).where(eq(walkTime.id, existing.id));
          return updated;
        }

        const id = newId(at);
        const created: WalkTimeRow = {
          id,
          stopId,
          placeId,
          minutesMin: nextMin,
          minutesMax: nextMax,
          origin: "manual",
          source: "user",
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        };
        await db.insert(walkTime).values(created);
        return created;
      }),
    );
  }

  // ─── Opções ───────────────────────────────────────────────────────────────

  async function listOptions(routeId: string): Promise<OptionRow[]> {
    const rows = await selectLive(db, option);
    return rows.filter((o) => o.routeId === routeId).sort((a, b) => a.sort - b.sort);
  }

  async function validateBusStops(boardPatternStopId: string, alightPatternStopId: string): Promise<void> {
    const [boardRow, alightRow] = await Promise.all([
      db.select().from(patternStop).where(eq(patternStop.id, boardPatternStopId)).then((r) => r[0]),
      db.select().from(patternStop).where(eq(patternStop.id, alightPatternStopId)).then((r) => r[0]),
    ]);
    if (!boardRow || !alightRow) {
      throw new Error("paragem do percurso não encontrada");
    }
    const problem = checkBusOption(
      { patternId: boardRow.patternId, position: boardRow.position },
      { patternId: alightRow.patternId, position: alightRow.position },
    );
    if (problem) {
      throw new Error(problem);
    }
  }

  function addOption(input: AddOptionInput, at: number): Promise<OptionRow> {
    return enqueue(() =>
      inTransaction(async () => {
        if (input.kind === "bus") {
          await validateBusStops(input.boardPatternStopId, input.alightPatternStopId);
        }

        const current = await listOptions(input.routeId);
        const maxSort = current.reduce((max, o) => Math.max(max, o.sort), -1);
        const sortOrder = maxSort + 1;

        const id = newId(at);
        const newRow: OptionRow = {
          id,
          routeId: input.routeId,
          kind: input.kind,
          boardPatternStopId: input.kind === "bus" ? input.boardPatternStopId : null,
          alightPatternStopId: input.kind === "bus" ? input.alightPatternStopId : null,
          walkMinutes: input.kind === "walk" ? input.walkMinutes : null,
          sort: sortOrder,
          source: "user",
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        };

        await db.insert(option).values(newRow);
        return newRow;
      }),
    );
  }

  function updateOption(id: string, patch: UpdateOptionPatch, at: number): Promise<OptionRow> {
    return enqueue(() =>
      inTransaction(async () => {
        const rows = await selectLive(db, option);
        const existing = rows.find((o) => o.id === id);
        if (!existing) throw new Error("opção não encontrada");

        const nextBoard = patch.boardPatternStopId !== undefined ? patch.boardPatternStopId : existing.boardPatternStopId;
        const nextAlight = patch.alightPatternStopId !== undefined ? patch.alightPatternStopId : existing.alightPatternStopId;
        const nextWalk = patch.walkMinutes !== undefined ? patch.walkMinutes : existing.walkMinutes;

        if (existing.kind === "bus" && nextBoard && nextAlight) {
          await validateBusStops(nextBoard, nextAlight);
        }

        const changed =
          nextBoard !== existing.boardPatternStopId ||
          nextAlight !== existing.alightPatternStopId ||
          nextWalk !== existing.walkMinutes;

        if (!changed) {
          return existing;
        }

        const updated: OptionRow = {
          ...existing,
          boardPatternStopId: nextBoard,
          alightPatternStopId: nextAlight,
          walkMinutes: nextWalk,
          updatedAt: at,
        };

        await db.update(option).set(updated).where(eq(option.id, id));
        return updated;
      }),
    );
  }

  function removeOption(id: string, at: number): Promise<{ token: OptionToken }> {
    return enqueue(() =>
      inTransaction(async () => {
        const rows = await selectLive(db, option);
        const existing = rows.find((o) => o.id === id);
        if (!existing) throw new Error("opção não encontrada");

        await db.update(option).set({ deletedAt: at, updatedAt: at }).where(eq(option.id, id));
        return { token: { option: existing } };
      }),
    );
  }

  function restoreOption(token: OptionToken, at: number): Promise<void> {
    return enqueue(() =>
      inTransaction(async () => {
        await db.update(option).set({ deletedAt: null, updatedAt: at }).where(eq(option.id, token.option.id));
      }),
    );
  }

  function reorderOptions(optionIdsInOrder: string[], at: number): Promise<void> {
    return enqueue(() =>
      inTransaction(async () => {
        const all = await selectLive(db, option);
        const byId = new Map(all.map((o) => [o.id, o]));
        for (let i = 0; i < optionIdsInOrder.length; i++) {
          const optId = optionIdsInOrder[i]!;
          const opt = byId.get(optId);
          if (opt && opt.sort !== i) {
            await db.update(option).set({ sort: i, updatedAt: at }).where(eq(option.id, optId));
          }
        }
      }),
    );
  }

  async function loadAll(): Promise<{
    places: PlaceRow[];
    routes: RouteRow[];
    options: OptionRow[];
    walkTimes: WalkTimeRow[];
  }> {
    const [p, r, o, w] = await Promise.all([
      selectLive(db, place),
      selectLive(db, route),
      selectLive(db, option),
      selectLive(db, walkTime),
    ]);
    return { places: p, routes: r, options: o, walkTimes: w };
  }

  return {
    getPlace,
    listPlaces,
    listShortcuts,
    createPlace,
    updatePlace,
    reorderShortcuts,
    getRoute,
    listRoutesTo,
    listRoutes,
    ensureRoute,
    getWalkTime,
    setWalkTime,
    listOptions,
    addOption,
    updateOption,
    removeOption,
    restoreOption,
    reorderOptions,
    loadAll,
  };
}

export type Places = ReturnType<typeof createPlaces>;

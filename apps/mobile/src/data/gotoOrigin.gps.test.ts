import { describe, expect, it } from "vitest";
import type { PositionFix } from "@notebus/domain";
import type { OptionRow, PlaceRow, RouteRow } from "../db/places";
import { resolveGotoOrigin } from "./gotoOrigin";

// T-66, parte do app: a posição decide a origem antes da escolha salva. Coordenadas INVENTADAS (D-091).
const T0 = 1_790_000_000_000;
const BASE = { lat: 39.74, lon: -8.8 };
const north = (m: number) => ({ lat: BASE.lat + m / 111_194.9, lon: BASE.lon });

const place = (id: string, name: string, m: number | null): PlaceRow => ({
  id,
  name,
  icon: null,
  lat: m === null ? null : north(m).lat,
  lon: m === null ? null : north(m).lon,
  isShortcut: false,
  shortcutOrder: null,
  source: "user",
  createdAt: T0,
  updatedAt: T0,
  deletedAt: null,
});
const route = (id: string, from: string, to: string): RouteRow => ({ id, originPlaceId: from, destinationPlaceId: to, source: "user", createdAt: T0, updatedAt: T0, deletedAt: null });
const option = (id: string, routeId: string): OptionRow => ({ id, routeId, deletedAt: null }) as unknown as OptionRow;

const fixAt = (m: number): PositionFix => ({ ...north(m), accuracyM: 20, atMs: T0 - 5_000 });
const at = (m: number) => ({ fix: fixAt(m), nowMs: T0 });

// Destino Shopping longe de tudo; Casa em 0 m e Facul em 210 m (a posição fica entre os dois).
const casa = place("p-casa", "Casa", 0);
const facul = place("p-facul", "Facul", 210);
const trabalho = place("p-trabalho", "Trabalho", null);
const shopping = place("p-shopping", "Shopping", 5000);
const routes = [route("r-casa", casa.id, shopping.id), route("r-facul", facul.id, shopping.id), route("r-trab", trabalho.id, shopping.id)];
const options = routes.map((r) => option(`o-${r.id}`, r.id));
const base = { destinationPlaceId: shopping.id, places: [casa, facul, trabalho, shopping], routes, options };
const origin = (r: ReturnType<typeof resolveGotoOrigin>) => (r.kind === "resolved" ? r.originPlaceId : r.kind);

describe("resolveGotoOrigin com posição (E-07, T-66)", () => {
  it("Casa a 90 m e Facul a 120 m → Casa (a mais perto)", () => {
    expect(origin(resolveGotoOrigin({ ...base, position: at(90) }))).toBe("p-casa");
  });

  it("só Facul a 140 m (Casa fora do raio) → Facul", () => {
    const semCasaPerto = { ...base, places: [{ ...casa, lat: north(-400).lat }, facul, trabalho, shopping] };
    expect(origin(resolveGotoOrigin({ ...semCasaPerto, position: at(70) }))).toBe("p-facul");
  });

  it("nenhum a menos de 150 m → vale a regra de uso (Casa, por nome)", () => {
    expect(origin(resolveGotoOrigin({ ...base, position: at(900) }))).toBe("p-casa");
    expect(origin(resolveGotoOrigin({ ...base, position: at(900), lastOriginMap: { [shopping.id]: trabalho.id } }))).toBe("p-trabalho");
  });

  it("lugar perto sem trajeto ao destino → cai na regra de hoje, sem passar para o segundo mais perto", () => {
    const semRota = { ...base, routes: routes.filter((r) => r.id !== "r-casa"), options: options.filter((o) => o.routeId !== "r-casa") };
    // Casa é a mais perto (90 m) e não tem trajeto; Facul (120 m) tem, mas não é usada pelo GPS. Sem Casa utilizável, regra 3.
    expect(origin(resolveGotoOrigin({ ...semRota, position: at(90), lastOriginMap: { [shopping.id]: trabalho.id } }))).toBe("p-trabalho");
    expect(origin(resolveGotoOrigin({ ...semRota, position: at(90) }))).toBe("p-facul");
  });

  it("lugar perto com trajeto mas sem nenhuma opção → conta como sem trajeto", () => {
    const semOpcao = { ...base, options: options.filter((o) => o.routeId !== "r-casa") };
    expect(origin(resolveGotoOrigin({ ...semOpcao, position: at(40), lastOriginMap: { [shopping.id]: trabalho.id } }))).toBe("p-trabalho");
  });

  it("escolha salva diferente da posição → o GPS vence", () => {
    expect(origin(resolveGotoOrigin({ ...base, position: at(205), lastOriginMap: { [shopping.id]: trabalho.id } }))).toBe("p-facul");
  });

  it("posição ausente, sem leitura ou inválida → idêntico a hoje", () => {
    const saved = { ...base, lastOriginMap: { [shopping.id]: trabalho.id } };
    const today = resolveGotoOrigin(saved);
    expect(origin(today)).toBe("p-trabalho");
    expect(resolveGotoOrigin({ ...saved, position: { fix: null, nowMs: T0 } })).toEqual(today);
    expect(resolveGotoOrigin({ ...saved, position: { fix: { ...fixAt(0), accuracyM: 500 }, nowMs: T0 } })).toEqual(today);
    expect(resolveGotoOrigin({ ...saved, position: { fix: { ...fixAt(0), atMs: T0 - 300_000 }, nowMs: T0 } })).toEqual(today);
  });

  it("o próprio destino perto não é origem", () => {
    const aqui = { ...base, destinationPlaceId: casa.id, places: [casa, facul, trabalho], routes: [route("r-f", facul.id, casa.id)], options: [option("o-f", "r-f")] };
    expect(origin(resolveGotoOrigin({ ...aqui, position: at(10) }))).toBe("p-facul");
  });
});

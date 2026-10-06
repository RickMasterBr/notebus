/// <reference types="node" />
/**
 * Teste T-49 (E-05 §6, Bloco 3 item 3.6):
 * Progressão temporal da folha "Ir para X":
 * - Às 07:58: L1 das 08:10 está na lista com "sair às 07:58" e é a primeira opção.
 * - Às 07:59: L1 das 08:10 expira (sair às 07:58 < 07:59) e sai da lista; a próxima viagem (08:40) sobe.
 * - Às 08:00: A opção a pé (50 min, chega 08:50) vence a L1 das 08:40 (chega 09:14) por 24 min (>= 15 min),
 *   ficando acima do ônibus na lista.
 *
 * Tudo sem recarregar o banco nem alterar as fontes de dados, variando apenas o instante do relógio.
 */
import { describe, expect, it } from "vitest";
import { formatServiceMinute, gotoCards } from "@notebus/domain";
import { createPlaces } from "../db/places";
import { buildGotoInputFromSources } from "./gotoData";
import { patternStopKey } from "./schedule";
import { fixture, lisbon, stopId, THURSDAY } from "./registroFixture";

describe("T-49: progressão temporal ao vivo (07:58 -> 07:59 -> 08:00)", () => {
  it("a lista se reordena e descarta viagens passadas a cada minuto sem recarregar", async () => {
    const f = await fixture();
    const placesRepo = createPlaces(f.db);

    const t0758 = lisbon(THURSDAY, "07:58", "00");

    // 1. Cadastra lugares: Casa e Facul
    const casa = await placesRepo.createPlace({ name: "Casa", icon: "casa", isShortcut: true }, t0758);
    const facul = await placesRepo.createPlace({ name: "Facul", icon: "facul", isShortcut: true }, t0758);

    // 2. Trajeto Casa → Facul
    const route = await placesRepo.ensureRoute(casa.id, facul.id, t0758);

    // 3. Tempo a pé: Casa ↔ Arrabalde = 10 min
    await placesRepo.setWalkTime(stopId("A"), casa.id, { minutesMin: 10 }, t0758);

    // 4. Percurso da Linha 1: embarque na Arrabalde (pos 2), descida no Campus (pos 5)
    const pat1 = f.data.patterns.find(
      (p) => p.stops.some((s) => s.stopId === stopId("A")) && p.stops.some((s) => s.stopId === stopId("K")),
    )!;
    const boardPos = pat1.stops.find((s) => s.stopId === stopId("A"))!.position;
    const alightPos = pat1.stops.find((s) => s.stopId === stopId("K"))!.position;
    const boardPatternStopId = f.data.patternStopIds.get(patternStopKey(pat1.id, boardPos))!;
    const alightPatternStopId = f.data.patternStopIds.get(patternStopKey(pat1.id, alightPos))!;

    // 5. Opção de ônibus (L1 Arrabalde → Campus com 10 min a pé até o embarque)
    await placesRepo.saveBusOption(
      {
        routeId: route.id,
        boardPatternStopId,
        alightPatternStopId,
        boardStopId: stopId("A"),
        originPlaceId: casa.id,
        walkToBoard: { minutesMin: 10 },
        alightStopId: stopId("K"),
        destinationPlaceId: facul.id,
        walkAfterAlight: { minutesMin: 0 },
      },
      t0758,
    );

    // 6. Opção a pé: 50 min
    await placesRepo.addOption(
      {
        routeId: route.id,
        kind: "walk",
        walkMinutes: 50,
      },
      t0758,
    );

    // Carrega dados uma única vez
    const placesData = await placesRepo.loadAll();
    const sources = {
      route: placesData.routes.find((r) => r.id === route.id)!,
      options: placesData.options,
      walkTimes: placesData.walkTimes,
      observations: [],
      rides: [],
      schedule: f.data,
    };

    // Encontra as viagens 08:10 e 08:40 pelos horários oficiais da Linha 1
    const trip0810 = f.data.trips.find(
      (t) => t.patternId === pat1.id && t.stopTimes.some((st) => st.position === 1 && st.serviceMinute === 490),
    )!;
    const trip0840 = f.data.trips.find(
      (t) => t.patternId === pat1.id && t.stopTimes.some((st) => st.position === 1 && st.serviceMinute === 520),
    )!;

    // ─── MINUTO 1: 07:58 ───────────────────────────────────────────────────
    const input0758 = buildGotoInputFromSources(sources, t0758)!;
    expect(input0758).not.toBeNull();

    const cards0758 = gotoCards(input0758);
    // Deve conter a L1 das 08:10, cujo sair às é exatamente 07:58 (478 min)
    expect(cards0758.length).toBeGreaterThanOrEqual(2);
    const firstBus0758 = cards0758.find((c) => c.kind === "bus");
    expect(firstBus0758).toBeDefined();
    expect(firstBus0758!.tripId).toBe(trip0810.id);
    expect(formatServiceMinute(firstBus0758!.leaveAt)).toBe("07:58");
    expect(formatServiceMinute(firstBus0758!.beAtStop)).toBe("08:08");

    // ─── MINUTO 2: 07:59 ───────────────────────────────────────────────────
    const t0759 = lisbon(THURSDAY, "07:59", "00");
    const input0759 = buildGotoInputFromSources(sources, t0759)!;
    const cards0759 = gotoCards(input0759);

    // Às 07:59, a viagem das 08:10 (sair às 07:58) já passou do minuto de saída e foi descartada
    const bus0810At0759 = cards0759.find((c) => c.kind === "bus" && c.tripId === trip0810.id);
    expect(bus0810At0759).toBeUndefined();

    // A próxima viagem (08:40) sobe para ser o primeiro ônibus
    const firstBus0759 = cards0759.find((c) => c.kind === "bus");
    expect(firstBus0759).toBeDefined();
    expect(firstBus0759!.tripId).toBe(trip0840.id);
    expect(formatServiceMinute(firstBus0759!.leaveAt)).toBe("08:28");

    // ─── MINUTO 3: 08:00 ───────────────────────────────────────────────────
    const t0800 = lisbon(THURSDAY, "08:00", "00");
    const input0800 = buildGotoInputFromSources(sources, t0800)!;
    const cards0800 = gotoCards(input0800);

    // Às 08:00:
    // A pé: sai 08:00 + 50 min = chega 08:50 (530 min).
    // Ônibus 08:40: chega 09:14 (554 min).
    // Diferença: 554 - 530 = 24 min >= 15 min (walkBeatsBusMinutes).
    // A opção a pé fica ACIMA do ônibus na lista!
    expect(cards0800[0]?.kind).toBe("walk");
    expect(cards0800[1]?.kind).toBe("bus");
    expect((cards0800[1] as any).tripId).toBe(trip0840.id);
  });
});

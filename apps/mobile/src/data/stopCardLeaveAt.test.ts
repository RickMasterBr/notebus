import { describe, expect, it } from "vitest";
import { gotoCards } from "@notebus/domain";
import { createPlaces } from "../db/places";
import { t } from "../i18n";
import { buildGotoInputFromSources } from "./gotoData";
import { fixture, lisbon, stopId, THURSDAY } from "./registroFixture";
import { patternStopKey } from "./schedule";
import { clockText } from "./stopCard";
import { stopCardLeaveAtSubtitle } from "./stopCardLeaveAt";


describe("stopCardLeaveAtSubtitle com fontes (TL-04 gotoCards)", () => {
  it("o horário mostrado no cartão é igual ao leaveAt do primeiro cartão da TL-04 para o mesmo trajeto e instante", async () => {
    const f = await fixture();
    const placesRepo = createPlaces(f.db);
    const t0758 = lisbon(THURSDAY, "07:58", "00");

    const casa = await placesRepo.createPlace({ name: "Casa", icon: "casa", isShortcut: true }, t0758);
    const facul = await placesRepo.createPlace({ name: "Facul", icon: "facul", isShortcut: true }, t0758);
    const route = await placesRepo.ensureRoute(casa.id, facul.id, t0758);
    await placesRepo.setWalkTime(stopId("A"), casa.id, { minutesMin: 10 }, t0758);

    const pat1 = f.data.patterns.find(
      (p) => p.stops.some((s) => s.stopId === stopId("A")) && p.stops.some((s) => s.stopId === stopId("K")),
    )!;
    const boardPos = pat1.stops.find((s) => s.stopId === stopId("A"))!.position;
    const alightPos = pat1.stops.find((s) => s.stopId === stopId("K"))!.position;
    const boardPatternStopId = f.data.patternStopIds.get(patternStopKey(pat1.id, boardPos))!;
    const alightPatternStopId = f.data.patternStopIds.get(patternStopKey(pat1.id, alightPos))!;

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

    const loaded = await placesRepo.loadAll();

    // 1. TL-04 calcula os cartões
    const gotoInput = buildGotoInputFromSources(
      {
        route: loaded.routes.find((r) => r.id === route.id)!,
        options: loaded.options,
        walkTimes: loaded.walkTimes,
        observations: [],
        rides: [],
        schedule: f.data,
      },
      t0758,
    )!;
    const tl04Cards = gotoCards(gotoInput);
    const firstBus = tl04Cards.find((c) => c.kind === "bus")!;
    expect(firstBus).toBeDefined();

    // 2. stopCardLeaveAtSubtitle calcula o subtítulo para o ponto A
    const subtitle = stopCardLeaveAtSubtitle({
      stopId: stopId("A"),
      places: loaded.places,
      routes: loaded.routes,
      options: loaded.options,
      walkTimes: loaded.walkTimes,
      observations: [],
      rides: [],
      schedule: f.data,
      now: t0758,
    });

    // Prova que não divergem: o horário formatado é exatamente igual ao leaveAt do primeiro cartão da TL-04
    expect(subtitle).toBe(t("home.stop_card.leave_at_neutral", { time: clockText(firstBus.leaveAt), place: "Casa" }));
  });

  it("ponto sem trajeto → sem linha (null)", async () => {
    const f = await fixture();
    const placesRepo = createPlaces(f.db);
    const t0758 = lisbon(THURSDAY, "07:58", "00");

    const casa = await placesRepo.createPlace({ name: "Casa", icon: "casa", isShortcut: true }, t0758);
    const facul = await placesRepo.createPlace({ name: "Facul", icon: "facul", isShortcut: true }, t0758);
    const route = await placesRepo.ensureRoute(casa.id, facul.id, t0758);
    await placesRepo.setWalkTime(stopId("A"), casa.id, { minutesMin: 10 }, t0758);

    const pat1 = f.data.patterns.find(
      (p) => p.stops.some((s) => s.stopId === stopId("A")) && p.stops.some((s) => s.stopId === stopId("K")),
    )!;
    const boardPos = pat1.stops.find((s) => s.stopId === stopId("A"))!.position;
    const alightPos = pat1.stops.find((s) => s.stopId === stopId("K"))!.position;
    const boardPatternStopId = f.data.patternStopIds.get(patternStopKey(pat1.id, boardPos))!;
    const alightPatternStopId = f.data.patternStopIds.get(patternStopKey(pat1.id, alightPos))!;

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

    const loaded = await placesRepo.loadAll();

    // Ponto X não tem nenhum trajeto que embarque nele
    const subtitle = stopCardLeaveAtSubtitle({
      stopId: stopId("X"),
      places: loaded.places,
      routes: loaded.routes,
      options: loaded.options,
      walkTimes: loaded.walkTimes,
      schedule: f.data,
      now: t0758,
    });

    expect(subtitle).toBeNull();
  });

  it("dois trajetos (Casa e outro) → escolhe Casa", async () => {
    const f = await fixture();
    const placesRepo = createPlaces(f.db);
    const t0758 = lisbon(THURSDAY, "07:58", "00");

    // Cadastra Trabalho e Casa com destinos
    const trabalho = await placesRepo.createPlace({ name: "Trabalho", icon: "star", isShortcut: true }, t0758);
    const casa = await placesRepo.createPlace({ name: "Casa", icon: "casa", isShortcut: true }, t0758);
    const facul = await placesRepo.createPlace({ name: "Facul", icon: "facul", isShortcut: true }, t0758);

    const routeTrabalho = await placesRepo.ensureRoute(trabalho.id, facul.id, t0758);
    const routeCasa = await placesRepo.ensureRoute(casa.id, facul.id, t0758);

    // Tempos a pé até o ponto A:
    // Trabalho -> A: 5 min
    // Casa -> A: 10 min
    await placesRepo.setWalkTime(stopId("A"), trabalho.id, { minutesMin: 5 }, t0758);
    await placesRepo.setWalkTime(stopId("A"), casa.id, { minutesMin: 10 }, t0758);

    const pat1 = f.data.patterns.find(
      (p) => p.stops.some((s) => s.stopId === stopId("A")) && p.stops.some((s) => s.stopId === stopId("K")),
    )!;
    const boardPos = pat1.stops.find((s) => s.stopId === stopId("A"))!.position;
    const alightPos = pat1.stops.find((s) => s.stopId === stopId("K"))!.position;
    const boardPatternStopId = f.data.patternStopIds.get(patternStopKey(pat1.id, boardPos))!;
    const alightPatternStopId = f.data.patternStopIds.get(patternStopKey(pat1.id, alightPos))!;

    // Opção para Trabalho -> Facul via L1
    await placesRepo.saveBusOption(
      {
        routeId: routeTrabalho.id,
        boardPatternStopId,
        alightPatternStopId,
        boardStopId: stopId("A"),
        originPlaceId: trabalho.id,
        walkToBoard: { minutesMin: 5 },
        alightStopId: stopId("K"),
        destinationPlaceId: facul.id,
        walkAfterAlight: { minutesMin: 0 },
      },
      t0758,
    );

    // Opção para Casa -> Facul via L1
    await placesRepo.saveBusOption(
      {
        routeId: routeCasa.id,
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

    const loaded = await placesRepo.loadAll();

    const subtitle = stopCardLeaveAtSubtitle({
      stopId: stopId("A"),
      places: loaded.places,
      routes: loaded.routes,
      options: loaded.options,
      walkTimes: loaded.walkTimes,
      schedule: f.data,
      now: t0758,
    });

    // Embora Trabalho saia mais tarde (08:03) e Casa saia mais cedo (07:58), a regra prioriza Casa
    expect(subtitle).toContain("Casa");
    expect(subtitle).not.toContain("Trabalho");
  });

  it("faixa a pé (D-100): usa o máximo, como o domínio", async () => {
    const f = await fixture();
    const placesRepo = createPlaces(f.db);
    const t0758 = lisbon(THURSDAY, "07:58", "00");

    const casa = await placesRepo.createPlace({ name: "Casa", icon: "casa", isShortcut: true }, t0758);
    const facul = await placesRepo.createPlace({ name: "Facul", icon: "facul", isShortcut: true }, t0758);
    const route = await placesRepo.ensureRoute(casa.id, facul.id, t0758);

    // Faixa a pé: min 5 min, max 10 min
    await placesRepo.setWalkTime(stopId("A"), casa.id, { minutesMin: 5, minutesMax: 10 }, t0758);

    const pat1 = f.data.patterns.find(
      (p) => p.stops.some((s) => s.stopId === stopId("A")) && p.stops.some((s) => s.stopId === stopId("K")),
    )!;
    const boardPos = pat1.stops.find((s) => s.stopId === stopId("A"))!.position;
    const alightPos = pat1.stops.find((s) => s.stopId === stopId("K"))!.position;
    const boardPatternStopId = f.data.patternStopIds.get(patternStopKey(pat1.id, boardPos))!;
    const alightPatternStopId = f.data.patternStopIds.get(patternStopKey(pat1.id, alightPos))!;

    await placesRepo.saveBusOption(
      {
        routeId: route.id,
        boardPatternStopId,
        alightPatternStopId,
        boardStopId: stopId("A"),
        originPlaceId: casa.id,
        walkToBoard: { minutesMin: 5, minutesMax: 10 },
        alightStopId: stopId("K"),
        destinationPlaceId: facul.id,
        walkAfterAlight: { minutesMin: 0 },
      },
      t0758,
    );

    const loaded = await placesRepo.loadAll();

    const subtitle = stopCardLeaveAtSubtitle({
      stopId: stopId("A"),
      places: loaded.places,
      routes: loaded.routes,
      options: loaded.options,
      walkTimes: loaded.walkTimes,
      schedule: f.data,
      now: t0758,
    });

    // beAtStop é 08:08 (488 min).
    // Com max = 10 min: leaveAt = 488 - 10 = 478 min (07:58).
    // Se usasse min = 5 min: leaveAt seria 488 - 5 = 483 min (08:03).
    expect(subtitle).toBe(t("home.stop_card.leave_at_neutral", { time: "07:58", place: "Casa" }));
  });
});


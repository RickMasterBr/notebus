import { describe, expect, it } from "vitest";
import { gotoCards } from "@notebus/domain";
import { createPlaces } from "../db/places";
import { t } from "../i18n";
import { buildGotoInputFromSources } from "./gotoData";
import { fixture, lisbon, stopId, THURSDAY } from "./registroFixture";
import { patternStopKey } from "./schedule";
import { clockText, type StopCard } from "./stopCard";
import { stopCardLeaveAtSubtitle, type PlaceRef, type WalkTimeRef } from "./stopCardLeaveAt";

describe("stopCardLeaveAtSubtitle", () => {
  const mockCard: StopCard = {
    stopId: "stop-arrabalde",
    name: "Arrabalde da Ponte",
    lines: [
      {
        code: "1",
        color: "#7CB342",
        destination: "Estação",
        state: {
          status: "next",
          time: "08:14",
          rangeStart: "08:08",
          rangeEnd: "08:16",
          beAtStop: "08:07",
          confidence: "medium",
          mayPassNow: false,
        },
      },
    ],
  };

  const mockPlaces: PlaceRef[] = [
    { id: "place-casa", name: "Casa", deletedAt: null },
    { id: "place-facul", name: "Facul", deletedAt: null },
  ];

  it("calcula subtítulo 'sair às 07:59 · Casa' quando beAtStop é 08:07 e tempo a pé é 8 min", () => {
    const walkTimes: WalkTimeRef[] = [
      {
        stopId: "stop-arrabalde",
        placeId: "place-casa",
        minutesMin: 8,
        minutesMax: null,
        deletedAt: null,
      },
    ];

    const result = stopCardLeaveAtSubtitle(mockCard, mockPlaces, walkTimes);
    expect(result).toBe("sair às 07:59 · Casa");
  });

  it("usa o maior valor da faixa a pé (D-100)", () => {
    const walkTimes: WalkTimeRef[] = [
      {
        stopId: "stop-arrabalde",
        placeId: "place-casa",
        minutesMin: 8,
        minutesMax: 10,
        deletedAt: null,
      },
    ];

    // 08:07 (487 min) - 10 min = 477 min (07:57)
    const result = stopCardLeaveAtSubtitle(mockCard, mockPlaces, walkTimes);
    expect(result).toBe("sair às 07:57 · Casa");
  });

  it("prioriza Casa mesmo se outro lugar aparecer antes na lista", () => {
    const places: PlaceRef[] = [
      { id: "place-trabalho", name: "Trabalho", deletedAt: null },
      { id: "place-casa", name: "Casa", deletedAt: null },
    ];
    const walkTimes: WalkTimeRef[] = [
      {
        stopId: "stop-arrabalde",
        placeId: "place-trabalho",
        minutesMin: 5,
        minutesMax: null,
        deletedAt: null,
      },
      {
        stopId: "stop-arrabalde",
        placeId: "place-casa",
        minutesMin: 8,
        minutesMax: null,
        deletedAt: null,
      },
    ];

    const result = stopCardLeaveAtSubtitle(mockCard, places, walkTimes);
    expect(result).toBe("sair às 07:59 · Casa");
  });

  it("usa o primeiro lugar se Casa não estiver associada ao ponto", () => {
    const places: PlaceRef[] = [
      { id: "place-trabalho", name: "Trabalho", deletedAt: null },
    ];
    const walkTimes: WalkTimeRef[] = [
      {
        stopId: "stop-arrabalde",
        placeId: "place-trabalho",
        minutesMin: 7,
        minutesMax: null,
        deletedAt: null,
      },
    ];

    // 08:07 - 7 min = 08:00
    const result = stopCardLeaveAtSubtitle(mockCard, places, walkTimes);
    expect(result).toBe("sair às 08:00 · Trabalho");
  });

  it("retorna null se não houver tempo a pé para o ponto", () => {
    const walkTimes: WalkTimeRef[] = [
      {
        stopId: "other-stop",
        placeId: "place-casa",
        minutesMin: 8,
        minutesMax: null,
        deletedAt: null,
      },
    ];

    const result = stopCardLeaveAtSubtitle(mockCard, mockPlaces, walkTimes);
    expect(result).toBeNull();
  });

  it("retorna null se a linha não tiver próximo ônibus (sem viagens hoje)", () => {
    const cardLater: StopCard = {
      stopId: "stop-arrabalde",
      name: "Arrabalde da Ponte",
      lines: [
        {
          code: "1",
          color: "#7CB342",
          destination: "Estação",
          state: {
            status: "later",
            reason: null,
            date: "2026-10-02",
            weekday: 5,
            time: "07:30",
          },
        },
      ],
    };
    const walkTimes: WalkTimeRef[] = [
      {
        stopId: "stop-arrabalde",
        placeId: "place-casa",
        minutesMin: 8,
        minutesMax: null,
        deletedAt: null,
      },
    ];

    const result = stopCardLeaveAtSubtitle(cardLater, mockPlaces, walkTimes);
    expect(result).toBeNull();
  });
});

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


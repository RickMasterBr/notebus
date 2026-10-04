/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { nearbyIds } from "../data/homeStart";
import { matchNetworkOf } from "../data/records";
import { fixture, lineId, lisbon, stopId, THURSDAY } from "../data/registroFixture";
import { buildTripCard } from "../data/rideView";
import { buildStopCard } from "../data/stopCard";
import { containerHeightOf, detentMetrics } from "./scrollInset";

describe("F3: Início mantém conteúdo após fechamento automático da viagem", () => {
  it("ride aberto → ride fecha por tempo → a Início mantém os pontos e a busca", async () => {
    const f = await fixture();
    const data = f.data;
    const recentIds = [stopId("A"), stopId("K"), stopId("S")];

    // 1. Embarque às 08:12:30 na Arrabalde (viagem 08:10 da Linha 1)
    const t0 = lisbon(THURSDAY, "08:12", "30");
    const board = await f.registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: t0 });
    await f.registro.refreshDeductions(t0);

    const load1 = await f.registro.load();
    const openRide = load1.rides.find((r) => r.status === "open");
    expect(openRide).toBeDefined();

    const obs1 = load1.observations.find((o) => o.id === openRide!.boardingObservationId);
    expect(obs1).toBeDefined();

    // Com ride aberto: tripCard existe
    const tripCard = buildTripCard(
      openRide!.id,
      {
        stopId: obs1!.stopId!,
        lineId: obs1!.lineId!,
        observedAt: obs1!.observedAt,
        observedEndAt: obs1!.observedEndAt,
        kind: obs1!.kind,
        mode: obs1!.mode,
      },
      data,
      matchNetworkOf(data),
      [],
      t0,
    );
    expect(tripCard).not.toBeNull();

    // Perto de você mostra os 3 pontos recentes
    const stopsBefore = nearbyIds(recentIds).flatMap((id) => {
      const card = buildStopCard(id, data, t0);
      return card ? [card] : [];
    });
    expect(stopsBefore).toHaveLength(3);

    // Contas de layout do HomeSheet com o cartão aberto
    const handleHeight = 24;
    const pillHeight = 48;
    const measuredCardHeight = 160;
    const insets = { top: 47, bottom: 34 };
    const window = { height: 844 };
    const spaceMd = 16;

    // Cálculo síncrono com cartão
    const effectiveCardHeightBefore = tripCard ? measuredCardHeight : 0;
    expect(effectiveCardHeightBefore).toBe(160);

    const smallBefore = handleHeight + effectiveCardHeightBefore + pillHeight + insets.bottom + spaceMd;
    const snapPointsBefore = [smallBefore, "50%", "90%"];
    const containerHeight = containerHeightOf(window.height, insets.top);
    const scrollAreaBefore = Math.max(
      80,
      Math.round(
        (detentMetrics(snapPointsBefore, containerHeight, handleHeight)[0]?.scrollAreaHeight ?? 0) -
          pillHeight -
          effectiveCardHeightBefore -
          spaceMd,
      ),
    );
    expect(scrollAreaBefore).toBeGreaterThan(80);

    // 2. O relógio avança para depois do fim da viagem + 15 min de folga (09:21:00)
    const tExpire = lisbon(THURSDAY, "09:21", "00");
    const expiredCount = await f.registro.expire(tExpire);
    expect(expiredCount).toBe(1);

    // 3. Após expirar: o ride passa a "closed", tripCard vira null
    const load2 = await f.registro.load();
    const openRideAfter = load2.rides.find((r) => r.status === "open");
    expect(openRideAfter).toBeUndefined();

    const tripCardAfter = openRideAfter ? buildTripCard(openRideAfter.id, {} as any, data, matchNetworkOf(data), [], tExpire) : null;
    expect(tripCardAfter).toBeNull();

    // 4. Início mantém os 3 pontos do Perto de você mesmo após a viagem fechar por tempo
    const stopsAfter = nearbyIds(recentIds).flatMap((id) => {
      const card = buildStopCard(id, data, tExpire);
      return card ? [card] : [];
    });
    expect(stopsAfter).toHaveLength(3);
    expect(stopsAfter.map((s) => s.stopId)).toEqual(recentIds);

    // 5. Cálculo síncrono sem cartão: effectiveCardHeight vira 0 de imediato (sem lag de 1 frame do useEffect)
    const effectiveCardHeightAfter = tripCardAfter ? measuredCardHeight : 0;
    expect(effectiveCardHeightAfter).toBe(0);

    const smallAfter = handleHeight + effectiveCardHeightAfter + pillHeight + insets.bottom + spaceMd;
    expect(smallAfter).toBe(handleHeight + pillHeight + insets.bottom + spaceMd);
    expect(smallAfter).toBeLessThan(smallBefore);

    const snapPointsAfter = [smallAfter, "50%", "90%"];
    const scrollAreaAfter = Math.max(
      80,
      Math.round(
        (detentMetrics(snapPointsAfter, containerHeight, handleHeight)[0]?.scrollAreaHeight ?? 0) -
          pillHeight -
          effectiveCardHeightAfter -
          spaceMd,
      ),
    );
    // A área de rolagem recupera o espaço do cartão
    expect(scrollAreaAfter).toBe(scrollAreaBefore + measuredCardHeight);
  });
});

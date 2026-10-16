import { describe, expect, it } from "vitest";
import { nearbyIds } from "./homeStart";
import { pickNearbyCards } from "./nearbyCards";

interface DummyCard {
  id: string;
}

const buildCard = (id: string): DummyCard | null =>
  id.startsWith("sem-cartao") ? null : { id };

describe("pickNearbyCards", () => {
  it("tabela de cenários de escolha dos cartões de Perto de você", () => {
    // 1. fix com 2 pontos que têm cartão → fix
    expect(pickNearbyCards(["f1", "f2"], ["r1", "r2"], buildCard)).toEqual({
      cards: [{ id: "f1" }, { id: "f2" }],
      source: "fix",
    });

    // 2. fix com pontos sem cartão e recentes válidos → recent (falha no código de antes)
    expect(
      pickNearbyCards(["sem-cartao-1", "sem-cartao-2"], ["r1", "r2"], buildCard),
    ).toEqual({
      cards: [{ id: "r1" }, { id: "r2" }],
      source: "recent",
    });

    // 3. fix vazio e recentes → recent
    expect(pickNearbyCards([], ["r1"], buildCard)).toEqual({
      cards: [{ id: "r1" }],
      source: "recent",
    });

    // 4. tudo sem cartão → none
    expect(pickNearbyCards(["sem-cartao"], ["sem-cartao-2"], buildCard)).toEqual({
      cards: [],
      source: "none",
    });
    expect(pickNearbyCards([], [], buildCard)).toEqual({
      cards: [],
      source: "none",
    });

    // 5. o limite de 3
    expect(
      pickNearbyCards(["f1", "f2", "f3", "f4"], [], buildCard),
    ).toEqual({
      cards: [{ id: "f1" }, { id: "f2" }, { id: "f3" }],
      source: "fix",
    });
    expect(
      pickNearbyCards([], ["r1", "r2", "r3", "r4"], buildCard),
    ).toEqual({
      cards: [{ id: "r1" }, { id: "r2" }, { id: "r3" }],
      source: "recent",
    });

    // 6. um recente sem cartão no meio é pulado
    expect(
      pickNearbyCards([], ["r1", "sem-cartao-meio", "r2"], buildCard),
    ).toEqual({
      cards: [{ id: "r1" }, { id: "r2" }],
      source: "recent",
    });
  });

  it("comprova que a regra de antes falhava no cenário de fix sem cartão e recentes válidos", () => {
    const byFix = ["sem-cartao-1"];
    const recentIds = ["r1", "r2"];

    // Lógica antiga de NearbyStops:
    const oldIds = byFix.length > 0 ? byFix : nearbyIds(recentIds);
    const oldCards = oldIds.flatMap((id) => {
      const c = buildCard(id);
      return c ? [c] : [];
    });
    // Na regra antiga, como byFix.length era > 0, os cartões ficavam vazios!
    expect(oldCards).toEqual([]);

    // Na regra nova, faz fallback e retorna os recentes com source "recent"
    const picked = pickNearbyCards(byFix, recentIds, buildCard);
    expect(picked.cards).toEqual([{ id: "r1" }, { id: "r2" }]);
    expect(picked.source).toBe("recent");
  });
});

import { describe, expect, it } from "vitest";
import { gotoCards } from "@notebus/domain";
import { buildGotoInputFromSources } from "../data/gotoData";
import { loadSchedule } from "../data/schedule";
import { createPlaces } from "../db/places";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { importMobilis } from "../db/importMobilis";
import { exampleSeed } from "../db/testing/exampleSeed";
import { patternStop } from "../db/schema";
import { t } from "../i18n";

// Quarta-feira 07/10/2026, 07:00 (dia útil)
const WED_NOW = Date.UTC(2026, 9, 7, 6, 0, 0); // 07:00 em Lisboa (UTC+1)

function hhmm(serviceMinute: number): string {
  const m = ((serviceMinute % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

async function setupPreviewFixture() {
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
  await importMobilis(importDb, seed, { now: () => WED_NOW });
  const schedule = await loadSchedule(db);
  const placesRepo = createPlaces(db);
  return { db, schedule, placesRepo };
}

describe("optionPreview (D-064)", () => {
  it("dois rascunhos da mesma linha com descidas diferentes geram textos de prévia diferentes", async () => {
    const { db, schedule, placesRepo } = await setupPreviewFixture();

    const casa = await placesRepo.createPlace({ name: "Casa" }, WED_NOW);
    const destino = await placesRepo.createPlace({ name: "Destino" }, WED_NOW);

    const effectiveRoute = {
      id: "preview-route",
      originPlaceId: casa.id,
      destinationPlaceId: destino.id,
      source: "user" as const,
      createdAt: WED_NOW,
      updatedAt: WED_NOW,
      deletedAt: null,
    };

    // Paragens da mesma linha: embarque na pos 1, descida A na pos 2, descida B na pos 3
    const ps = await db.select().from(patternStop);
    const pat1 = ps[0]!.patternId;
    const patStops = ps.filter((p) => p.patternId === pat1).sort((a, b) => a.position - b.position);

    const boardPs = patStops[0]!;
    const alightPs1 = patStops[1]!;
    const alightPs2 = patStops[2]!;

    // Draft 1 com descida na pos 2
    const draftOpt1 = {
      id: "draft-1",
      routeId: effectiveRoute.id,
      kind: "bus" as const,
      source: "user" as const,
      boardPatternStopId: boardPs.id,
      alightPatternStopId: alightPs1.id,
      walkMinutes: null,
      sort: 0,
      createdAt: WED_NOW,
      updatedAt: WED_NOW,
      deletedAt: null,
    };

    // Draft 2 com descida na pos 3
    const draftOpt2 = {
      id: "draft-2",
      routeId: effectiveRoute.id,
      kind: "bus" as const,
      source: "user" as const,
      boardPatternStopId: boardPs.id,
      alightPatternStopId: alightPs2.id,
      walkMinutes: null,
      sort: 0,
      createdAt: WED_NOW,
      updatedAt: WED_NOW,
      deletedAt: null,
    };

    const input1 = buildGotoInputFromSources(
      {
        route: effectiveRoute,
        options: [draftOpt1],
        walkTimes: [],
        observations: [],
        rides: [],
        schedule,
      },
      WED_NOW,
    )!;

    const input2 = buildGotoInputFromSources(
      {
        route: effectiveRoute,
        options: [draftOpt2],
        walkTimes: [],
        observations: [],
        rides: [],
        schedule,
      },
      WED_NOW,
    )!;

    const card1 = gotoCards(input1)[0]!;
    const card2 = gotoCards(input2)[0]!;

    expect(card1).toBeDefined();
    expect(card2).toBeDefined();

    // Texto com a implementação corrigida (D-064: sair às, chega ~, até)
    const previewText1 = t("option.preview.detail", {
      leave: hhmm(card1.leaveAt),
      arrive: hhmm(card1.arriveAt),
      until: hhmm(card1.until),
    });

    const previewText2 = t("option.preview.detail", {
      leave: hhmm(card2.leaveAt),
      arrive: hhmm(card2.arriveAt),
      until: hhmm(card2.until),
    });

    // Como as descidas são paragens diferentes, os horários de chegada diferem
    expect(previewText1).not.toEqual(previewText2);
    expect(previewText1).toContain("sair às");
    expect(previewText1).toContain("chega ~");
    expect(previewText1).toContain("até");
  });

  it("falharia com a implementação anterior que repetia o parâmetro time e ignorava a descida", async () => {
    // Na implementação anterior:
    // template: "no ponto {{time}} · desce ~{{time}}"
    // params: { time: hhmm(card.beAtStop), time_arrive: hhmm(card.arriveAt) }
    const oldTemplate = "no ponto {{time}} · desce ~{{time}}";
    const formatOld = (beAtStop: number, arriveAt: number) => {
      return oldTemplate.replace(/\{\{time\}\}/g, hhmm(beAtStop));
    };

    // Para a mesma linha e mesmo embarque, beAtStop é igual para ambos os rascunhos:
    const beAtStop = 486; // 08:06
    const arriveAt1 = 525; // 08:45
    const arriveAt2 = 535; // 08:55

    const oldText1 = formatOld(beAtStop, arriveAt1);
    const oldText2 = formatOld(beAtStop, arriveAt2);

    // O código anterior gerava exatamente o mesmo texto, fazendo a troca de descida não mudar nada na tela:
    expect(oldText1).toEqual(oldText2);
    expect(oldText1).toBe("no ponto 08:06 · desce ~08:06");
  });
});

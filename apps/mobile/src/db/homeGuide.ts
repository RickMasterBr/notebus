/**
 * Fatos e dispensa do cartão de guia do Início (E-08.5 bloco 13, Item 2).
 * Estado persistido no SQLite local.
 */
import { uuidv7 } from "@notebus/domain";
import { asc, desc, eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { realNow } from "../data/clock";
import { selectLive } from "./query";
import { dataset, line, pattern, patternStop, setting, stop } from "./schema";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export const HOME_GUIDE_DISMISSED = "home_guide_dismissed";

export interface HomeGuideStopSummary {
  id: string;
  name: string;
}

export interface HomeGuideFactsResult {
  hasDataset: boolean;
  lastStop: HomeGuideStopSummary | null;
  lastLineFirstStop: HomeGuideStopSummary | null;
}

export async function isHomeGuideDismissed(db: AnyDb): Promise<boolean> {
  const marked = await selectLive(db, setting, eq(setting.key, HOME_GUIDE_DISMISSED)).limit(1);
  return marked.length > 0;
}

export async function dismissHomeGuide(db: AnyDb, now = realNow()): Promise<void> {
  await db
    .insert(setting)
    .values({
      id: uuidv7(now),
      createdAt: now,
      updatedAt: now,
      source: "user",
      key: HOME_GUIDE_DISMISSED,
      value: true,
    })
    .onConflictDoNothing();
}

export async function readHomeGuideFacts(db: AnyDb): Promise<HomeGuideFactsResult> {
  const datasets = await selectLive(db, dataset).limit(1);
  const hasDataset = datasets.length > 0;

  // lastStop = ponto vivo source: "user" de maior createdAt (desempate pelo id)
  const userStops = await selectLive(db, stop, eq(stop.source, "user"))
    .orderBy(desc(stop.createdAt), desc(stop.id))
    .limit(1);
  const lastStop: HomeGuideStopSummary | null = userStops[0]
    ? { id: userStops[0].id, name: userStops[0].name }
    : null;

  // lastLineFirstStop = o primeiro ponto (posição 0) do primeiro percurso da linha viva source: "user" de maior createdAt
  const userLines = await selectLive(db, line, eq(line.source, "user"))
    .orderBy(desc(line.createdAt), desc(line.id))
    .limit(1);
  const lastLine = userLines[0];

  let lastLineFirstStop: HomeGuideStopSummary | null = null;
  if (lastLine) {
    const patterns = await selectLive(db, pattern, eq(pattern.lineId, lastLine.id))
      .orderBy(asc(pattern.createdAt), asc(pattern.id))
      .limit(1);
    const firstPattern = patterns[0];
    if (firstPattern) {
      const patternStops = await selectLive(db, patternStop, eq(patternStop.patternId, firstPattern.id))
        .orderBy(asc(patternStop.position), asc(patternStop.id))
        .limit(1);
      const firstPatternStop = patternStops[0];
      if (firstPatternStop) {
        const stopRows = await selectLive(db, stop, eq(stop.id, firstPatternStop.stopId)).limit(1);
        if (stopRows[0]) {
          lastLineFirstStop = { id: stopRows[0].id, name: stopRows[0].name };
        }
      }
    }
  }

  return {
    hasDataset,
    lastStop,
    lastLineFirstStop,
  };
}

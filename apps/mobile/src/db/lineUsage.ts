/**
 * Quanto uma linha está em uso (E-08 §5.4, D-112, bloco 9, Item 4): registros vivos dela e trajetos vivos que
 * embarcam ou descem numa paragem de percurso dela. O aviso de saída chega à linha pela opção, sem contagem própria.
 */
import { eq, inArray, or } from "drizzle-orm";
import type { AnyDb } from "./inTransaction";
import { selectLive } from "./query";
import { observation, option, pattern, patternStop } from "./schema";

export interface LineUsage {
  observations: number;
  options: number;
}

export const isLineUnused = (usage: LineUsage) => usage.observations + usage.options === 0;

const IN_CHUNK = 100;

export async function lineUsage(db: AnyDb, lineId: string): Promise<LineUsage> {
  const [observations, patterns] = await Promise.all([
    selectLive(db, observation, eq(observation.lineId, lineId)),
    selectLive(db, pattern, eq(pattern.lineId, lineId)),
  ]);

  const patternStopIds: string[] = [];
  const patternIds = patterns.map((p) => p.id);
  for (let i = 0; i < patternIds.length; i += IN_CHUNK) {
    const rows = await selectLive(db, patternStop, inArray(patternStop.patternId, patternIds.slice(i, i + IN_CHUNK)));
    patternStopIds.push(...rows.map((r) => r.id));
  }

  const optionIds = new Set<string>();
  for (let i = 0; i < patternStopIds.length; i += IN_CHUNK) {
    const chunk = patternStopIds.slice(i, i + IN_CHUNK);
    const rows = await selectLive(
      db,
      option,
      or(inArray(option.boardPatternStopId, chunk), inArray(option.alightPatternStopId, chunk)),
    );
    for (const row of rows) optionIds.add(row.id);
  }

  return { observations: observations.length, options: optionIds.size };
}

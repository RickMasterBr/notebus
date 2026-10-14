/// <reference types="node" />
/**
 * Fixture estendida com viagens de sábado e dias múltiplos (E-08.5 bloco 10, A5, T-131, T-132).
 * SÓ PARA TESTE (dados inventados, D-091).
 */
import { officialId } from "@notebus/domain";
import { type ImportDb, importMobilis } from "../db/importMobilis";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { lineSeed } from "../db/testing/lineSeed";
import { createRegistro, type RegistroDeps } from "./registro";
import { matchNetworkOf } from "./records";
import { type ScheduleSnapshot, loadSchedule } from "./schedule";

const NAMES = {
  S: "Estação Inventada",
  A: "Arrabalde Inventado",
  E: "Estádio Fictício",
  C: "Largo Um",
  K: "Campus Exemplo",
  X: "Praça X",
};

export const learnedNetworkSeed = () =>
  lineSeed(NAMES, [
    {
      code: "1",
      color: "#7CB342",
      stops: [
        { stop: "S", timepoint: true },
        { stop: "A" },
        { stop: "E" },
        { stop: "C" },
        { stop: "K", timepoint: true },
        { stop: "E" },
        { stop: "S", timepoint: true },
      ],
      trips: [
        { id: "0810", days: ["weekday"], times: { 1: 490, 2: 492, 5: 524, 7: 545 } },
        { id: "0840", days: ["weekday"], times: { 1: 520, 2: 522, 5: 554, 7: 575 } },
        { id: "0810_sat", days: ["saturday"], times: { 1: 490, 2: 492, 5: 524, 7: 545 } },
        { id: "0005_sat", days: ["saturday"], times: { 1: 1445, 2: 1447, 5: 1479, 7: 1500 } },
      ],
    },
    {
      code: "2",
      color: "#D32F2F",
      stops: [{ stop: "A", timepoint: true }, { stop: "K", timepoint: true }],
      trips: [
        { id: "0830", days: ["weekday"], times: { 1: 510, 2: 530 } },
        { id: "0830_both", days: ["weekday", "saturday"], times: { 1: 510, 2: 530 } },
      ],
    },
    {
      code: "3",
      color: "#4FC3F7",
      stops: [
        { stop: "A", timepoint: true },
        { stop: "X", timepoint: true },
        { stop: "A" },
        { stop: "K", timepoint: true },
      ],
      trips: [{ id: "0800", days: ["weekday"], times: { 1: 500, 3: 506, 4: 520 } }],
    },
  ]);

export const learnedStopId = (short: keyof typeof NAMES) => officialId(`mobilis/stop/${short}`);
export const learnedLineId = (code: string) => officialId(`mobilis/line/${code}`);
export const learnedTripIdOf = (line: string, id: string) =>
  officialId(`mobilis/2026-01-01/trip/L${line}/${id}`);

export interface LearnedFixture {
  db: ReturnType<typeof testDbWithSqlite>["db"];
  data: ScheduleSnapshot;
  registro: ReturnType<typeof createRegistro>;
  raw: ImportDb;
}

export async function learnedFixture(deps: Partial<RegistroDeps> = {}): Promise<LearnedFixture> {
  const { db, sqlite } = testDbWithSqlite();
  const importDb: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(importDb, learnedNetworkSeed());
  const data = await loadSchedule(db);
  const registro = createRegistro(db, {
    network: () => matchNetworkOf(data),
    snapshot: () => data,
    ...deps,
  });
  return { db, data, registro, raw: importDb };
}

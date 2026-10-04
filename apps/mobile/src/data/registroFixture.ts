/// <reference types="node" />
/**
 * SÓ PARA TESTE. Rede **inventada** (nada da MOBILIS, D-091) para os testes do registro (E-03 bloco 2).
 *
 * Paragens: S Estação · A Arrabalde · E Estádio · C Largo Um · K Campus · X Praça X (nomes inventados).
 * L1 (dias úteis), percurso circular de 7 posições: 1 S(controle) · 2 A · 3 E · 4 C · 5 K(controle) · 6 E (2ª passagem) · 7 S(controle).
 *   Viagem 08:10 (horários só nos pontos de controle e na Arrabalde): pos. 1 = 490, 2 = 492, 5 = 524, 7 = 545.
 *   Interpoladas: pos. 3 = 492 + 32/3 ≈ 502,67; pos. 4 ≈ 513,33; pos. 6 = 524 + 21/2 = 534,5.
 *   Viagem 08:40: as mesmas + 30.
 * L2: A(controle) → K(controle), viagem 08:30 (510 → 530).
 * L3: A(controle) · X(controle) · A · K(controle): passa duas vezes na Arrabalde (pos. 1 = 500 e pos. 3 = 506).
 *   Próximo ponto de controle: da pos. 1 é a Praça X; da pos. 3 é o Campus.
 * Quinta 08/10/2026, hora de verão (UTC+1).
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

export const exampleNetworkSeed = () =>
  lineSeed(NAMES, [
    {
      code: "1",
      color: "#7CB342",
      stops: [{ stop: "S", timepoint: true }, { stop: "A" }, { stop: "E" }, { stop: "C" }, { stop: "K", timepoint: true }, { stop: "E" }, { stop: "S", timepoint: true }],
      trips: [
        { id: "0810", days: ["weekday"], times: { 1: 490, 2: 492, 5: 524, 7: 545 } },
        { id: "0840", days: ["weekday"], times: { 1: 520, 2: 522, 5: 554, 7: 575 } },
      ],
    },
    {
      code: "2",
      color: "#D32F2F",
      stops: [{ stop: "A", timepoint: true }, { stop: "K", timepoint: true }],
      trips: [{ id: "0830", days: ["weekday"], times: { 1: 510, 2: 530 } }],
    },
    {
      code: "3",
      color: "#4FC3F7",
      stops: [{ stop: "A", timepoint: true }, { stop: "X", timepoint: true }, { stop: "A" }, { stop: "K", timepoint: true }],
      trips: [{ id: "0800", days: ["weekday"], times: { 1: 500, 3: 506, 4: 520 } }],
    },
  ]);

export const stopId = (short: keyof typeof NAMES) => officialId(`mobilis/stop/${short}`);
export const lineId = (code: string) => officialId(`mobilis/line/${code}`);
export const tripIdOf = (line: string, id: string) => officialId(`mobilis/2026-01-01/trip/L${line}/${id}`);

/** Instante de um relógio de parede de Lisboa em hora de verão (UTC+1); `ss` com segundos. */
export const lisbon = (date: string, hhmm: string, ss = "00") => Date.parse(`${date}T${hhmm}:${ss}Z`) - 3_600_000;

export const THURSDAY = "2026-10-08";

export interface Fixture {
  db: ReturnType<typeof testDbWithSqlite>["db"];
  data: ScheduleSnapshot;
  registro: ReturnType<typeof createRegistro>;
}

/** Banco em memória com a rede inventada importada; `deps` troca a dedução (falha ou demora) nos testes. */
export async function fixture(deps: Partial<RegistroDeps> = {}): Promise<Fixture> {
  const { db, sqlite } = testDbWithSqlite();
  const importDb: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(importDb, exampleNetworkSeed());
  const data = await loadSchedule(db);
  const registro = createRegistro(db, { network: () => matchNetworkOf(data), snapshot: () => data, ...deps });
  return { db, data, registro };
}

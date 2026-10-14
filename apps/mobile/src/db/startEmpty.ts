/**
 * "Começar do zero" (D-201): grava a rede do usuário, para o primeiro ponto e a primeira linha terem onde nascer.
 * Sem feriado gravado: os nacionais vêm do date-holidays na hora; municipais e manuais ficam em Ajustes.
 */
import { officialId, type DayTypeCode } from "@notebus/domain";
import { eq } from "drizzle-orm";
import { realNow } from "../data/clock";
import { FIRST_RUN_DONE, markFirstRunDone } from "./appState";
import { DAY_TYPES } from "./importMobilis";
import { inTransaction, type AnyDb } from "./inTransaction";
import { selectLive } from "./query";
import { dayType, network, setting } from "./schema";

/**
 * Ids fixos de propósito: reinstalar e "Começar do zero" de novo gera os mesmos ids, e o backup, que junta por `id`,
 * não duplica a rede nem os tipos de dia.
 */
export const USER_NETWORK_ID = officialId("notebus/user/network");
export const userDayTypeId = (code: DayTypeCode) => officialId(`notebus/user/day_type/${code}`);

/** Dado gravado no banco (não é texto de tela), no molde dos nomes de `importMobilis.ts`. */
export const USER_NETWORK_NAME = "Minha rede";
export const USER_NETWORK_TIMEZONE = "Europe/Lisbon";

type Deps = { afterNetwork?: () => void | Promise<void> };

async function insertUserNetwork(db: AnyDb, now: number): Promise<void> {
  await db
    .insert(network)
    .values({
      id: USER_NETWORK_ID,
      createdAt: now,
      updatedAt: now,
      source: "user",
      officialKey: null,
      name: USER_NETWORK_NAME,
      timezone: USER_NETWORK_TIMEZONE,
    })
    .onConflictDoNothing();
  for (const [code, { name, sort }] of Object.entries(DAY_TYPES) as [DayTypeCode, (typeof DAY_TYPES)[DayTypeCode]][]) {
    await db
      .insert(dayType)
      .values({
        id: userDayTypeId(code),
        createdAt: now,
        updatedAt: now,
        source: "user",
        officialKey: null,
        networkId: USER_NETWORK_ID,
        code,
        name,
        sort,
      })
      .onConflictDoNothing();
  }
}

/** Cria a rede do usuário e marca o primeiro uso, numa transação só. Pode rodar de novo sem duplicar. */
export async function startEmpty(db: AnyDb, now = realNow(), deps: Deps = {}): Promise<void> {
  await inTransaction(db, async () => {
    await insertUserNetwork(db, now);
    await deps.afterNetwork?.();
    await markFirstRunDone(db, now);
  });
}

/**
 * Conserta quem já passou pelo "Começar do zero" quebrado: primeiro uso marcado e nenhuma rede viva.
 * Sem o primeiro uso marcado, a tela de primeiro uso ainda vai aparecer, então não grava nada.
 */
export async function ensureUserNetwork(db: AnyDb, now = realNow(), deps: Deps = {}): Promise<"created" | "kept"> {
  return inTransaction(db, async () => {
    if ((await selectLive(db, network).limit(1)).length > 0) return "kept";
    if ((await selectLive(db, setting, eq(setting.key, FIRST_RUN_DONE)).limit(1)).length === 0) return "kept";
    await insertUserNetwork(db, now);
    await deps.afterNetwork?.();
    return "created";
  });
}

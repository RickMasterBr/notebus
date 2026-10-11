/// <reference types="node" />
// E-08 item 2 (T-86, parte do bloco 2): o horário declarado faz a ida e volta do backup. Dados inventados (D-091).
import { createHash } from "node:crypto";
import { planDeclaration, serializeBackup } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { prepareImport } from "../data/backupFlow";
import { THURSDAY, fixture, lineId, lisbon, stopId, type Fixture } from "../data/registroFixture";
import { loadSchedule } from "../data/schedule";
import { importBackup, readBackupInput } from "./backup";
import { createDeclaredTimes } from "./declaredTimes";
import type { BackupStore } from "./migrate";

const NOW = lisbon(THURSDAY, "18:00");
const hm = (h: number, m: number) => h * 60 + m;
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const all = (f: Fixture, sql: string) => f.raw.all(sql, []) as Record<string, unknown>[];
const noCopies: BackupStore = { create: async () => {}, restore: async () => {}, list: async () => [], remove: async () => {} };
const exportText = async (f: Fixture) => serializeBackup(await readBackupInput(f.raw, { now: NOW, appVersion: "1.0.0" }), sha256);

async function importText(f: Fixture, text: string) {
  const preview = await prepareImport(f.raw, text, sha256);
  if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
  return f.registro.exclusive(() => importBackup(f.raw, preview.file, { backups: noCopies, now: NOW + 60_000 }));
}

/** Declara 08:52 no Campus da L2 (substitui o oficial 08:50) e 08:50 no Largo Um da L1 (viagem parcial nova). */
async function declareBoth(f: Fixture) {
  let n = 0;
  const declared = createDeclaredTimes({
    db: f.db,
    exclusive: f.registro.exclusive,
    reload: async () => loadSchedule(f.db),
    rematch: async () => {},
    reschedule: async () => {},
    newId: () => `0199c3a0-0000-7000-8000-${String(++n).padStart(12, "0")}`,
  });
  const snap = await loadSchedule(f.db);
  const plan = (code: string, stop: "C" | "K", minute: number) => {
    const patternId = [...snap.patternLine].find(([, info]) => info.code === code)![0];
    const dayTypes = new Map(snap.schedule.trips.map((t) => [t.id, t.dayTypes]));
    const result = planDeclaration({
      patterns: snap.patterns.filter((p) => p.id === patternId),
      trips: snap.trips.filter((t) => t.patternId === patternId).map((t) => ({ ...t, dayTypes: dayTypes.get(t.id) ?? [] })),
      stopId: stopId(stop),
      serviceMinute: minute,
      dayTypes: ["weekday"],
    });
    if (!result.ok) throw new Error(result.reason);
    return { stopId: stopId(stop), serviceMinute: minute, steps: result.steps };
  };
  for (const input of [plan("2", "K", hm(8, 52)), plan("1", "C", hm(8, 50))]) {
    const result = await declared.declare(input, NOW);
    if (!result.ok) throw new Error(result.reason);
  }
}

/** Tudo o que o declarar toca, sem perder as linhas apagadas (o oficial substituído fica apagado, não some). */
const state = (f: Fixture) => ({
  stopTime: all(f, "SELECT id, trip_id, pattern_stop_id, service_minute, origin, source, official_key, deleted_at FROM stop_time ORDER BY id"),
  trip: all(f, "SELECT id, timetable_id, first_position, last_position, source, official_key, deleted_at FROM trip ORDER BY id"),
  tripDayType: all(f, "SELECT id, trip_id, day_type_id, source, official_key, deleted_at FROM trip_day_type ORDER BY id"),
});

describe("T-86 (dados): ida e volta do backup com horários declarados", () => {
  it("o cenário tem o oficial substituído (official_edited, apagado), o declarado e a parcial", async () => {
    const src = await fixture();
    await declareBoth(src);
    const edited = all(src, `SELECT service_minute, origin, source, deleted_at FROM stop_time WHERE source = 'official_edited'`);
    expect(edited).toEqual([{ service_minute: 530, origin: "official", source: "official_edited", deleted_at: NOW }]);
    expect(all(src, "SELECT service_minute FROM stop_time WHERE origin = 'declared' ORDER BY service_minute")).toEqual([{ service_minute: hm(8, 50) }, { service_minute: hm(8, 52) }]);
    expect(all(src, "SELECT first_position, last_position FROM trip WHERE source = 'user'")).toEqual([{ first_position: 4, last_position: 4 }]);
    expect(lineId("2")).toBeTruthy();
  });

  it("exportar, apagar (banco novo com a MOBILIS), importar: o estado volta igual", async () => {
    const src = await fixture();
    await declareBoth(src);
    const before = state(src);
    const text = await exportText(src);

    const dst = await fixture();
    expect(state(dst)).not.toEqual(before);
    await importText(dst, text);
    expect(state(dst)).toEqual(before);
  });
});

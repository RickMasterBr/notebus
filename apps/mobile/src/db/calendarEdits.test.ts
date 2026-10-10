/// <reference types="node" />
// E-08 item 5 (UC-13, T-80, T-81, T-86): exceções de data e feriados do usuário. Rede inventada (D-091).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dayTypeOf } from "@notebus/domain";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import { createPreferences } from "../data/preferences";
import { matchNetworkOf } from "../data/records";
import { createRegistro } from "../data/registro";
import { THURSDAY, exampleNetworkSeed, lineId, lisbon, stopId, tripIdOf } from "../data/registroFixture";
import { type ScheduleSnapshot, loadSchedule } from "../data/schedule";
import { type CalendarEdits, createCalendarEdits, isRealDate } from "./calendarEdits";
import { type ImportDb, importMobilis } from "./importMobilis";
import { migrations } from "./migrations";
import * as schema from "./schema";
import { testDbWithSqlite } from "./testing/drizzleTestDb";
import { createFakePort } from "../notifications/fakePort";
import { NodeSqlite } from "./testing/nodeSqlite";

const NOW = lisbon(THURSDAY, "18:00");
const TUESDAY_BEFORE = "2026-10-06";

type Db = ReturnType<typeof testDbWithSqlite>["db"];

/** Tudo ligado como no app: o horário em memória só muda quando o `reload` roda; o recasamento usa a rede recarregada. */
async function wire(db: Db, raw: ImportDb) {
  let n = 0;
  const newId = () => `0199c3a0-0000-7000-8000-${String(++n).padStart(12, "0")}`;
  const state = {
    current: await loadSchedule(db),
    reload: 0,
    reschedule: 0,
    rematch: 0,
    lastChanged: null as ((serviceDate: string) => boolean) | null,
  };
  const registro = createRegistro(db, { network: () => matchNetworkOf(state.current), snapshot: () => state.current, newId });
  const edits: CalendarEdits<ScheduleSnapshot> = createCalendarEdits<ScheduleSnapshot>({
    db,
    exclusive: registro.exclusive,
    calendar: () => state.current.calendar,
    reload: async () => {
      state.reload++;
      return (state.current = await loadSchedule(db));
    },
    rematch: async (changed, fresh, nowMs) => {
      state.rematch++;
      state.lastChanged = changed;
      return registro.rematchWhere(changed, matchNetworkOf(fresh), nowMs);
    },
    reschedule: async () => void state.reschedule++,
    newId,
  });
  const prefs = createPreferences({ db, exclusive: registro.exclusive, reload: async () => void (state.current = await loadSchedule(db)), reschedule: async () => {}, port: createFakePort(), newId });
  return { raw, db, state, registro, edits, prefs, rows: (sql: string, params: (string | number | null)[] = []) => raw.all(sql, params) as Record<string, unknown>[] };
}

async function setup() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(raw, exampleNetworkSeed());
  // A rede inventada só tem o tipo "dia útil"; a MOBILIS real tem os três (as exceções precisam deles).
  const net = (raw.all("SELECT id FROM network", []) as { id: string }[])[0]!.id;
  for (const [id, code, name, sort] of [["dt-sat", "saturday", "Sábado", 2], ["dt-sun", "sunday_holiday", "Domingo e feriado", 3]] as const) {
    await raw.run(
      "INSERT INTO day_type (id, created_at, updated_at, source, official_key, network_id, code, name, sort) VALUES (?, 1, 1, 'official', ?, ?, ?, ?, ?)",
      [id, `exemplo/${code}`, net, code, name, sort],
    );
  }
  await raw.run(
    "INSERT INTO holiday (id, created_at, updated_at, source, official_key, network_id, date, name, scope) VALUES ('hol-leiria', 1, 1, 'official', 'exemplo/hol-2026-05-22', ?, '2026-05-22', 'Feriado municipal de Leiria', 'municipal')",
    [net],
  );
  return wire(db, raw);
}

type Env = Awaited<ReturnType<typeof setup>>;
const typeOn = (e: Env, date: string) => dayTypeOf(date, e.state.current.calendar);
const liveOverrides = (e: Env, date: string) =>
  e.rows("SELECT d.code, o.note FROM date_override o JOIN day_type d ON d.id = o.day_type_id WHERE o.date = ? AND o.deleted_at IS NULL", [date]);

describe("T-80: exceção de data", () => {
  it("24/12/2026 como sábado vale; a mesma data como domingo substitui (kind replaced) e deixa uma linha viva", async () => {
    const e = await setup();
    expect(typeOn(e, "2026-12-24")).toEqual({ dayType: "weekday", reason: "weekday" });

    const first = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: "ponte" }, NOW);
    expect(first).toMatchObject({ ok: true, kind: "created", previous: null });
    expect(typeOn(e, "2026-12-24")).toEqual({ dayType: "saturday", reason: "override" });

    const second = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "sunday_holiday", note: null }, NOW + 1000);
    expect(second).toMatchObject({ ok: true, kind: "replaced", previous: { dayTypeCode: "saturday", note: "ponte" } });
    expect(typeOn(e, "2026-12-24")).toEqual({ dayType: "sunday_holiday", reason: "override" });
    expect(liveOverrides(e, "2026-12-24")).toEqual([{ code: "sunday_holiday", note: null }]);
    expect(e.rows("SELECT COUNT(*) AS n FROM date_override WHERE date = '2026-12-24'")).toEqual([{ n: 1 }]);
  });

  it("a exceção grava como dado do usuário: source user, official_key nulo, sem apagar nada", async () => {
    const e = await setup();
    await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: "  ponte  " }, NOW);
    expect(e.rows("SELECT source, official_key, deleted_at, note, created_at, updated_at FROM date_override")).toEqual([
      { source: "user", official_key: null, deleted_at: null, note: "ponte", created_at: NOW, updated_at: NOW },
    ]);
  });

  it("exceção sobre o feriado municipal de 22/05/2026 (sexta) vence o feriado", async () => {
    const e = await setup();
    expect(typeOn(e, "2026-05-22")).toMatchObject({ dayType: "sunday_holiday", reason: "holiday" });
    await e.edits.saveOverride({ date: "2026-05-22", dayTypeCode: "saturday", note: null }, NOW);
    expect(typeOn(e, "2026-05-22")).toEqual({ dayType: "saturday", reason: "override" });
  });

  it("undo de uma criação apaga a nova; undo de uma substituição devolve a anterior", async () => {
    const e = await setup();
    const created = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: "ponte" }, NOW);
    if (!created.ok) throw new Error(created.reason);
    const replaced = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "sunday_holiday", note: "outra" }, NOW + 1000);
    if (!replaced.ok) throw new Error(replaced.reason);

    await replaced.undo(NOW + 2000);
    expect(typeOn(e, "2026-12-24")).toEqual({ dayType: "saturday", reason: "override" });
    expect(liveOverrides(e, "2026-12-24")).toEqual([{ code: "saturday", note: "ponte" }]);

    await created.undo(NOW + 3000);
    expect(typeOn(e, "2026-12-24")).toEqual({ dayType: "weekday", reason: "weekday" });
    expect(liveOverrides(e, "2026-12-24")).toEqual([]);
  });

  it("deleteOverride apaga (deleted_at) e o undo traz de volta; id que não existe é recusado", async () => {
    const e = await setup();
    const saved = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: null }, NOW);
    if (!saved.ok) throw new Error(saved.reason);
    const del = await e.edits.deleteOverride(saved.id, NOW + 1000);
    if (!del.ok) throw new Error(del.reason);
    expect(typeOn(e, "2026-12-24").reason).toBe("weekday");
    await del.undo(NOW + 2000);
    expect(typeOn(e, "2026-12-24")).toEqual({ dayType: "saturday", reason: "override" });
    expect(await e.edits.deleteOverride("nao-existe", NOW)).toEqual({ ok: false, reason: "not_found" });
  });

  it("recusa data que não existe, tipo de dia desconhecido e rede ausente, sem gravar", async () => {
    const e = await setup();
    expect(await e.edits.saveOverride({ date: "2027-02-30", dayTypeCode: "saturday", note: null }, NOW)).toEqual({ ok: false, reason: "invalid_date" });
    expect(await e.edits.saveOverride({ date: "24/12/2026", dayTypeCode: "saturday", note: null }, NOW)).toEqual({ ok: false, reason: "invalid_date" });
    expect(await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "feriado" as never, note: null }, NOW)).toEqual({ ok: false, reason: "unknown_day_type" });
    expect(e.rows("SELECT COUNT(*) AS n FROM date_override")).toEqual([{ n: 0 }]);
    expect(e.state.reload).toBe(0);
  });
});

describe("T-80: o registro da data é recasado", () => {
  async function withRecords(e: Env) {
    const board = (stop: Parameters<typeof stopId>[0], date: string, hhmm: string, ss = "00") =>
      e.registro.board({ stopId: stopId(stop), lineId: lineId("1"), at: lisbon(date, hhmm, ss) });
    const onThursday = await board("A", THURSDAY, "08:12", "30");
    const onFriday = await board("A", "2026-10-09", "08:12", "30");
    const manual = await board("A", THURSDAY, "13:00");
    await e.registro.refreshDeductions(NOW);
    // Você escolheu a viagem à mão (TL-09): `manual`, que a fila nunca recalcula.
    await e.raw.run(
      "UPDATE observation SET match_status = 'manual', trip_id = ?, deviation_min = 0, updated_at = ? WHERE id = ?",
      [tripIdOf("1", "0840"), NOW, manual.observationId],
    );
    return { onThursday: onThursday.observationId, onFriday: onFriday.observationId, manual: manual.observationId };
  }
  const obs = (e: Env, id: string) =>
    e.rows("SELECT id, observed_at, recorded_at, service_date, match_status, trip_id, deviation_min, updated_at FROM observation WHERE id = ?", [id])[0]!;

  it("uma quinta (dia útil) que vira domingo: o registro casado da data é recasado, a hora dele não muda", async () => {
    const e = await setup();
    const ids = await withRecords(e);
    const before = obs(e, ids.onThursday);
    expect(before).toMatchObject({ match_status: "auto", trip_id: tripIdOf("1", "0810"), service_date: THURSDAY });

    await e.edits.saveOverride({ date: THURSDAY, dayTypeCode: "sunday_holiday", note: null }, NOW + 5000);

    const after = obs(e, ids.onThursday);
    expect(after.match_status).not.toBe("auto");
    expect(after.trip_id).toBeNull();
    expect(after.observed_at).toBe(before.observed_at);
    expect(after.recorded_at).toBe(before.recorded_at);
    expect(e.state.rematch).toBe(1);
    // Só as datas que mudaram de tipo de dia entram no recasamento.
    expect(e.state.lastChanged!(THURSDAY)).toBe(true);
    expect(e.state.lastChanged!("2026-10-09")).toBe(false);
  });

  it("registro manual não é recasado; registro de outra data (sexta) fica como estava", async () => {
    const e = await setup();
    const ids = await withRecords(e);
    const manualBefore = obs(e, ids.manual);
    const fridayBefore = obs(e, ids.onFriday);

    await e.edits.saveOverride({ date: THURSDAY, dayTypeCode: "sunday_holiday", note: null }, NOW + 5000);

    expect(obs(e, ids.manual)).toEqual(manualBefore);
    expect(manualBefore).toMatchObject({ match_status: "manual", trip_id: tripIdOf("1", "0840") });
    expect(obs(e, ids.onFriday)).toEqual(fridayBefore);
  });

  it("o undo da exceção devolve o registro ao estado de antes", async () => {
    const e = await setup();
    const ids = await withRecords(e);
    const before = obs(e, ids.onThursday);
    const saved = await e.edits.saveOverride({ date: THURSDAY, dayTypeCode: "sunday_holiday", note: null }, NOW + 5000);
    if (!saved.ok) throw new Error(saved.reason);
    expect(obs(e, ids.onThursday).match_status).not.toBe("auto");

    await saved.undo(NOW + 6000);

    const after = obs(e, ids.onThursday);
    expect(after).toMatchObject({ match_status: "auto", trip_id: before.trip_id, deviation_min: before.deviation_min, observed_at: before.observed_at });
  });

  it("uma exceção que não muda o tipo de dia da data (quinta como dia útil) não recasa nada", async () => {
    const e = await setup();
    const ids = await withRecords(e);
    const before = obs(e, ids.onThursday);
    await e.edits.saveOverride({ date: THURSDAY, dayTypeCode: "weekday", note: "igual" }, NOW + 5000);
    expect(obs(e, ids.onThursday)).toEqual(before);
    expect(e.state.lastChanged!(THURSDAY)).toBe(false);
  });
});

describe("T-81 (dados): feriado do usuário", () => {
  it("'3 de março' que repete grava, vale em 2027 e 2028, apaga e desfaz", async () => {
    const e = await setup();
    const saved = await e.edits.saveHoliday({ name: "  3 de março ", date: "2026-03-03", recurring: true }, NOW);
    if (!saved.ok) throw new Error(saved.reason);
    expect(e.rows("SELECT source, official_key, scope, recurring, name, date, deleted_at FROM holiday WHERE id = ?", [saved.id])).toEqual([
      { source: "user", official_key: null, scope: "manual", recurring: 1, name: "3 de março", date: "2026-03-03", deleted_at: null },
    ]);
    for (const date of ["2026-03-03", "2027-03-03", "2028-03-03"]) {
      expect([date, typeOn(e, date)]).toEqual([date, { dayType: "sunday_holiday", reason: "holiday", holidayName: "3 de março" }]);
    }

    const del = await e.edits.deleteHoliday(saved.id, NOW + 1000);
    if (!del.ok) throw new Error(del.reason);
    expect(typeOn(e, "2027-03-03").reason).toBe("weekday");
    expect(e.rows("SELECT deleted_at FROM holiday WHERE id = ?", [saved.id])).toEqual([{ deleted_at: NOW + 1000 }]);

    await del.undo(NOW + 2000);
    expect(typeOn(e, "2028-03-03")).toMatchObject({ reason: "holiday", holidayName: "3 de março" });

    // O undo da criação também apaga.
    await saved.undo(NOW + 3000);
    expect(typeOn(e, "2027-03-03").reason).toBe("weekday");
  });

  it("feriado sem repetição vale só na data", async () => {
    const e = await setup();
    await e.edits.saveHoliday({ name: "10 de abril", date: "2027-04-10", recurring: false }, NOW);
    expect(typeOn(e, "2027-04-10")).toMatchObject({ reason: "holiday" });
    expect(typeOn(e, "2028-04-10")).toEqual({ dayType: "weekday", reason: "weekday" });
  });

  it("o feriado municipal do arquivo oficial não se apaga: official, e o banco não é tocado", async () => {
    const e = await setup();
    const before = e.rows("SELECT * FROM holiday WHERE id = 'hol-leiria'");
    expect(await e.edits.deleteHoliday("hol-leiria", NOW)).toEqual({ ok: false, reason: "official" });
    expect(e.rows("SELECT * FROM holiday WHERE id = 'hol-leiria'")).toEqual(before);
    expect(e.state.reload).toBe(0);
    expect(await e.edits.deleteHoliday("nao-existe", NOW)).toEqual({ ok: false, reason: "not_found" });
  });

  it("recusa data inexistente, nome vazio e recurring que não é booleano, sem gravar", async () => {
    const e = await setup();
    const base = { name: "Dia", date: "2026-03-03", recurring: true };
    expect(await e.edits.saveHoliday({ ...base, date: "2027-02-30" }, NOW)).toEqual({ ok: false, reason: "invalid_date" });
    expect(await e.edits.saveHoliday({ ...base, date: "2026-13-01" }, NOW)).toEqual({ ok: false, reason: "invalid_date" });
    expect(await e.edits.saveHoliday({ ...base, name: "   " }, NOW)).toEqual({ ok: false, reason: "empty_name" });
    expect(await e.edits.saveHoliday({ ...base, recurring: "sim" as never }, NOW)).toEqual({ ok: false, reason: "invalid_recurring" });
    expect(e.rows("SELECT COUNT(*) AS n FROM holiday WHERE scope = 'manual'")).toEqual([{ n: 0 }]);
    expect(e.state.reload).toBe(0);
  });

  it("isRealDate: 29/02 só em ano bissexto", () => {
    expect(isRealDate("2028-02-29")).toBe(true);
    expect(isRealDate("2027-02-29")).toBe(false);
    expect(isRealDate("2027-02-30")).toBe(false);
    expect(isRealDate("2026-04-31")).toBe(false);
    expect(isRealDate("2026-12-31")).toBe(true);
    expect(isRealDate(20261231)).toBe(false);
  });
});

describe("ligações depois de gravar", () => {
  it("cada gravação e cada undo recarregam os horários e reagendam os avisos, uma vez", async () => {
    const e = await setup();
    const saved = await e.edits.saveHoliday({ name: "Dia", date: "2026-03-03", recurring: false }, NOW);
    expect([e.state.reload, e.state.reschedule]).toEqual([1, 1]);
    if (!saved.ok) throw new Error(saved.reason);
    await saved.undo(NOW + 1);
    expect([e.state.reload, e.state.reschedule]).toEqual([2, 2]);
    await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: null }, NOW + 2);
    expect([e.state.reload, e.state.reschedule]).toEqual([3, 3]);
  });

  it("o horário em memória só enxerga a gravação por causa da recarga", async () => {
    const e = await setup();
    await e.edits.saveHoliday({ name: "Dia", date: "2026-03-03", recurring: false }, NOW);
    expect(e.state.current.calendar.holidays.some((h) => h.name === "Dia" && h.scope === "manual")).toBe(true);
  });
});

describe("T-86 (dados): fechar e abrir o banco de novo mantém tudo", () => {
  function openFile(path: string) {
    const conn = new NodeSqlite(path);
    const db = drizzle(
      async (sql, params, method) => {
        const stmt = conn.db.prepare(sql);
        if (method === "run") {
          stmt.run(...(params as never[]));
          return { rows: [] };
        }
        const rows = stmt.all(...(params as never[])).map((r) => Object.values(r as object));
        return { rows: method === "get" ? (rows[0] ?? []) : rows };
      },
      { schema },
    );
    return { conn, db: db as unknown as Db };
  }

  it("exceção, feriado e margem gravados sobrevivem à reabertura da conexão", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "notebus-e08-cal-")), "notebus.db");
    const first = openFile(path);
    for (const m of migrations) for (const s of m.sql.split("--> statement-breakpoint")) first.conn.db.exec(s);
    await importMobilis(first.conn, exampleNetworkSeed());
    const net = (first.conn.all("SELECT id FROM network") as { id: string }[])[0]!.id;
    await first.conn.run(
      "INSERT INTO day_type (id, created_at, updated_at, source, official_key, network_id, code, name, sort) VALUES ('dt-sat', 1, 1, 'official', 'exemplo/saturday', ?, 'saturday', 'Sábado', 2)",
      [net],
    );
    const env = await wire(first.db, first.conn);
    expect(await env.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: "ponte" }, NOW)).toMatchObject({ ok: true });
    expect(await env.edits.saveHoliday({ name: "3 de março", date: "2026-03-03", recurring: true }, NOW + 1)).toMatchObject({ ok: true });
    expect(await env.prefs.setMargin(5, NOW + 2)).toBe(true);
    first.conn.db.close();

    const reopened = openFile(path);
    const data = await loadSchedule(reopened.db);
    expect(data.margin).toBe(5);
    expect(dayTypeOf("2026-12-24", data.calendar)).toEqual({ dayType: "saturday", reason: "override" });
    expect(dayTypeOf("2028-03-03", data.calendar)).toMatchObject({ reason: "holiday", holidayName: "3 de março" });
    expect(reopened.conn.all("SELECT recurring, scope FROM holiday WHERE name = '3 de março'")).toEqual([{ recurring: 1, scope: "manual" }]);
    reopened.conn.db.close();
  });
});

describe("Item 0: lacunas do bloco 1", () => {
  it("Item 0.3: undo vencido de saveOverride não apaga a versão mais nova", async () => {
    const e = await setup();
    const first = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: "v1" }, NOW);
    if (!first.ok) throw new Error(first.reason);
    const second = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "sunday_holiday", note: "v2" }, NOW + 1000);
    if (!second.ok) throw new Error(second.reason);
    const third = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "weekday", note: "v3" }, NOW + 2000);
    if (!third.ok) throw new Error(third.reason);

    // O primeiro undo está vencido: não deve fazer nada, a terceira versão continua
    await first.undo(NOW + 3000);
    expect(typeOn(e, "2026-12-24")).toEqual({ dayType: "weekday", reason: "override" });
    expect(liveOverrides(e, "2026-12-24")).toEqual([{ code: "weekday", note: "v3" }]);

    // O segundo undo (de uma substituição) também está vencido: não deve fazer nada, a terceira versão continua
    await second.undo(NOW + 4000);
    expect(typeOn(e, "2026-12-24")).toEqual({ dayType: "weekday", reason: "override" });
    expect(liveOverrides(e, "2026-12-24")).toEqual([{ code: "weekday", note: "v3" }]);

    // O terceiro undo ainda é válido: desfaz e volta à segunda versão
    await third.undo(NOW + 5000);
    expect(typeOn(e, "2026-12-24")).toEqual({ dayType: "sunday_holiday", reason: "override" });
    expect(liveOverrides(e, "2026-12-24")).toEqual([{ code: "sunday_holiday", note: "v2" }]);
  });

  it("Item 0.3: undo vencido de deleteOverride, saveHoliday e deleteHoliday não faz nada", async () => {
    const e = await setup();
    // saveHoliday
    const hol = await e.edits.saveHoliday({ name: "Festa", date: "2026-06-01", recurring: false }, NOW);
    if (!hol.ok) throw new Error(hol.reason);
    await e.raw.run("UPDATE holiday SET updated_at = ? WHERE id = ?", [NOW + 500, hol.id]);
    await hol.undo(NOW + 1000);
    // continua vivo porque o undo estava vencido
    expect(e.rows("SELECT name FROM holiday WHERE id = ? AND deleted_at IS NULL", [hol.id])).toHaveLength(1);

    // deleteHoliday
    const del = await e.edits.deleteHoliday(hol.id, NOW + 1500);
    if (!del.ok) throw new Error(del.reason);
    await e.raw.run("UPDATE holiday SET updated_at = ? WHERE id = ?", [NOW + 1800, hol.id]);
    await del.undo(NOW + 2000);
    // continua apagado
    expect(e.rows("SELECT name FROM holiday WHERE id = ? AND deleted_at IS NULL", [hol.id])).toHaveLength(0);

    // deleteOverride
    const ov = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: null }, NOW + 2100);
    if (!ov.ok) throw new Error(ov.reason);
    const delOv = await e.edits.deleteOverride(ov.id, NOW + 2200);
    if (!delOv.ok) throw new Error(delOv.reason);
    await e.raw.run("UPDATE date_override SET updated_at = ? WHERE id = ?", [NOW + 2300, ov.id]);
    await delOv.undo(NOW + 2400);
    // continua apagado
    expect(liveOverrides(e, "2026-12-24")).toEqual([]);
  });

  it("Item 0.4: note que não é texto vira null sem estourar erro", async () => {
    const e = await setup();
    const resUndef = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: undefined as never }, NOW);
    expect(resUndef).toMatchObject({ ok: true });
    expect(liveOverrides(e, "2026-12-24")[0]?.note).toBeNull();

    const resNull = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: null }, NOW + 1);
    expect(resNull).toMatchObject({ ok: true });
    expect(liveOverrides(e, "2026-12-24")[0]?.note).toBeNull();

    const resEmpty = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: "" }, NOW + 2);
    expect(resEmpty).toMatchObject({ ok: true });
    expect(liveOverrides(e, "2026-12-24")[0]?.note).toBeNull();

    const resSpaces = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: "   " }, NOW + 3);
    expect(resSpaces).toMatchObject({ ok: true });
    expect(liveOverrides(e, "2026-12-24")[0]?.note).toBeNull();

    const resTrimmed = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: "  x  " }, NOW + 4);
    expect(resTrimmed).toMatchObject({ ok: true });
    expect(liveOverrides(e, "2026-12-24")[0]?.note).toBe("x");

    const resNum = await e.edits.saveOverride({ date: "2026-12-24", dayTypeCode: "saturday", note: 123 as never }, NOW + 5);
    expect(resNum).toMatchObject({ ok: true });
    expect(liveOverrides(e, "2026-12-24")[0]?.note).toBeNull();
  });
});

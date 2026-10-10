/// <reference types="node" />
// Preferências (E-08 item 4, D-019, T-79): a margem, os feriados municipais e o interruptor dos avisos. Dados inventados (D-091).
import { gotoCards } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { importMobilis } from "../db/importMobilis";
import { DEFAULT_PREFERENCES, isValidMargin } from "../db/preferences";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { type LineSpec, lineSeed } from "../db/testing/lineSeed";
import { createFakePort } from "../notifications/fakePort";
import { createScheduler } from "../notifications/scheduler";
import { WED_0700, schedulerFixture } from "../notifications/schedulerFixture";
import { buildGotoInput } from "./gotoData";
import { createPreferences } from "./preferences";
import { createRegistro } from "./registro";
import { fixture } from "./registroFixture";
import { loadSchedule } from "./schedule";
import { buildStopCard } from "./stopCard";
import { buildStopDay } from "./stopDay";

const NOW = Date.UTC(2026, 9, 10, 12, 0);

async function setup() {
  const fx = await fixture();
  const calls = { reload: 0, reschedule: 0 };
  const prefs = createPreferences({
    db: fx.db,
    exclusive: fx.registro.exclusive,
    reload: async () => void calls.reload++,
    reschedule: async () => void calls.reschedule++,
    port: createFakePort(),
  });
  return { ...fx, prefs, calls };
}

describe("padrões e leitura", () => {
  it("sem nada gravado: margem 2, municipais ligados, avisos permitidos", async () => {
    const f = await setup();
    expect(await f.prefs.read()).toEqual({ margin: 2, includeMunicipalHolidays: true, alarmsAllowed: true });
    expect(DEFAULT_PREFERENCES).toEqual({ margin: 2, includeMunicipalHolidays: true, alarmsAllowed: true });
  });

  it("o que se grava volta na leitura, e uma chave gravada de novo troca o valor (uma linha só por chave)", async () => {
    const f = await setup();
    await f.prefs.setMargin(5, NOW);
    await f.prefs.setIncludeMunicipalHolidays(false, NOW);
    await f.prefs.setAlarmsAllowed(false, NOW);
    expect(await f.prefs.read()).toEqual({ margin: 5, includeMunicipalHolidays: false, alarmsAllowed: false });
    await f.prefs.setMargin(0, NOW + 1);
    expect((await f.prefs.read()).margin).toBe(0);
    const rows = f.raw.all("SELECT key, value, source FROM setting ORDER BY key", []);
    expect(rows).toEqual([
      { key: "alarms_allowed", value: "false", source: "user" },
      { key: "include_municipal_holidays", value: "false", source: "user" },
      { key: "margin_minutes", value: "0", source: "user" },
    ]);
  });

  it("uma linha apagada da mesma chave volta a valer em vez de quebrar a chave única", async () => {
    const f = await setup();
    await f.prefs.setMargin(4, NOW);
    await f.raw.run("UPDATE setting SET deleted_at = 1 WHERE key = 'margin_minutes'", []);
    expect((await f.prefs.read()).margin).toBe(2);
    await f.prefs.setMargin(6, NOW + 1);
    expect((await f.prefs.read()).margin).toBe(6);
    expect(f.raw.all("SELECT COUNT(*) AS n FROM setting WHERE key = 'margin_minutes'", [])).toEqual([{ n: 1 }]);
  });
});

describe("T-79: o setter da margem", () => {
  it("aceita 0 e 10 e os inteiros de 1 a 9", async () => {
    const f = await setup();
    for (const v of [0, 1, 2, 5, 9, 10]) {
      expect(await f.prefs.setMargin(v, NOW)).toBe(true);
      expect((await f.prefs.read()).margin).toBe(v);
    }
  });

  it("recusa 11, -1, 2,5 e NaN: devolve falso, não grava, não recarrega e não reagenda", async () => {
    const f = await setup();
    await f.prefs.setMargin(3, NOW);
    f.calls.reload = f.calls.reschedule = 0;
    for (const v of [11, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, 40]) {
      expect([v, await f.prefs.setMargin(v, NOW + 1)]).toEqual([v, false]);
    }
    expect((await f.prefs.read()).margin).toBe(3);
    expect(f.calls).toEqual({ reload: 0, reschedule: 0 });
    expect(isValidMargin(10)).toBe(true);
    expect(isValidMargin(11)).toBe(false);
  });

  it("gravar a margem recarrega os horários e reagenda os avisos, uma vez cada", async () => {
    const f = await setup();
    await f.prefs.setMargin(4, NOW);
    expect(f.calls).toEqual({ reload: 1, reschedule: 1 });
  });

  it("os horários recarregados trazem a margem gravada (e o padrão sem ela)", async () => {
    const f = await setup();
    expect((await loadSchedule(f.db)).margin).toBe(2);
    await f.prefs.setMargin(7, NOW);
    expect((await loadSchedule(f.db)).margin).toBe(7);
  });

  it("os municipais e o interruptor dos avisos também recarregam e reagendam", async () => {
    const f = await setup();
    await f.prefs.setIncludeMunicipalHolidays(false, NOW);
    expect(f.calls).toEqual({ reload: 1, reschedule: 1 });
    await f.prefs.setAlarmsAllowed(false, NOW);
    expect(f.calls).toEqual({ reload: 2, reschedule: 2 });
    expect((await loadSchedule(f.db)).calendar.includeMunicipal).toBe(false);
  });
});

describe("T-79: o 'esteja no ponto às' usa a margem", () => {
  const NAMES = {
    praca: "Praça Inventada",
    rua: "Rua Exemplo",
    largo: "Largo Fictício",
    mercado: "Mercado Fictício",
    estadio: "Estádio Inventado",
    terminal: "Terminal Exemplo",
  };
  // A Rua (posição 2 da linha 1) fica em 08:12, interpolada (±4): faixa 08:08 a 08:16.
  const LINES: LineSpec[] = [
    {
      code: "1",
      color: "#7A3FF2",
      stops: [{ stop: "praca", timepoint: true }, { stop: "rua" }, { stop: "largo" }, { stop: "mercado" }, { stop: "estadio" }, { stop: "terminal", timepoint: true }],
      trips: [{ id: "0810", days: ["weekday"], times: { 1: 490, 6: 500 } }],
    },
  ];

  async function beAtStopWith(margin: number | null) {
    const { db, sqlite } = testDbWithSqlite();
    const raw = {
      exec: async (sql: string) => sqlite.exec(sql),
      run: async (sql: string, params: (string | number | null)[]) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
      all: (sql: string, params: (string | number | null)[]) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
    };
    const seed = lineSeed(NAMES, LINES);
    await importMobilis(raw, seed);
    const registro = createRegistro(db, { network: () => null, snapshot: () => null });
    const prefs = createPreferences({ db, exclusive: registro.exclusive, reload: async () => {}, reschedule: async () => {}, port: createFakePort() });
    if (margin !== null) expect(await prefs.setMargin(margin, NOW)).toBe(true);
    const data = await loadSchedule(db);
    const ruaId = seed.stops.find((s) => s.key === "mobilis/stop/rua")!.id;
    const instant = Date.parse("2026-10-08T07:00:00Z") - 3_600_000; // quinta 07:00 em Lisboa (hora de verão)
    const line = buildStopDay(ruaId, data, instant)!.lines.find((l) => l.code === "1")!;
    const row = line.rows.find((r) => r.position === 2)!;
    const card = buildStopCard(ruaId, data, instant)!.lines.find((l) => l.code === "1")!.state;
    if (card.status !== "next") throw new Error("o cartão do ponto devia mostrar o próximo ônibus");
    return { range: [row.rangeStart, row.rangeEnd], beAtStop: row.beAtStop, card: card.beAtStop };
  }

  it("faixa 08:08 a 08:16: margem 2 (padrão) → 08:06; margem 5 → 08:03; 0 → 08:08; 10 → 07:58", async () => {
    expect(await beAtStopWith(null)).toEqual({ range: ["08:08", "08:16"], beAtStop: "08:06", card: "08:06" });
    expect(await beAtStopWith(2)).toEqual({ range: ["08:08", "08:16"], beAtStop: "08:06", card: "08:06" });
    expect(await beAtStopWith(5)).toEqual({ range: ["08:08", "08:16"], beAtStop: "08:03", card: "08:03" });
    expect(await beAtStopWith(0)).toEqual({ range: ["08:08", "08:16"], beAtStop: "08:08", card: "08:08" });
    expect(await beAtStopWith(10)).toEqual({ range: ["08:08", "08:16"], beAtStop: "07:58", card: "07:58" });
  });
});

describe("T-79: o 'sair às' do trajeto usa a margem", () => {
  it("margem 5 antecipa o 'sair às' de cada cartão de ônibus em 3 minutos", async () => {
    const fx = await schedulerFixture();
    const at = async (margin: number | undefined) => {
      const input = await buildGotoInput(fx.routeId, WED_0700, { ...fx.data, margin }, fx.db);
      return gotoCards(input!).flatMap((c) => (c.kind === "bus" ? [c.leaveAt] : []));
    };
    const standard = await at(undefined);
    expect(standard.length).toBeGreaterThan(0);
    expect(await at(2)).toEqual(standard);
    expect(await at(5)).toEqual(standard.map((m) => m - 3));
  });
});

describe("E-06 §3.2: mudar a margem reagenda os avisos", () => {
  it("o horário do aviso depende da margem: margem 5 antecipa cada aviso em 3 minutos, no porta falso", async () => {
    const fx = await schedulerFixture();
    const port = createFakePort("granted");
    const scheduler = createScheduler({ port, db: fx.db, now: () => WED_0700 });
    const prefs = createPreferences({ db: fx.db, exclusive: fx.registro.exclusive, reload: async () => {}, reschedule: () => scheduler.reschedule(), port });
    await fx.alarmsRepo.createAlarm(fx.newAlarm(), WED_0700);
    await scheduler.reschedule();
    const before = new Map([...port.scheduled.values()].map((r) => [r.id, r]));
    expect(before.size).toBeGreaterThan(5);

    expect(await prefs.setMargin(5, WED_0700)).toBe(true);

    expect(port.scheduled.size).toBe(before.size);
    for (const [id, old] of before) {
      const now = port.scheduled.get(id)!;
      expect([id, now.at]).toEqual([id, old.at - 3 * 60_000]);
      expect(now.body).not.toBe(old.body);
    }
  });
});

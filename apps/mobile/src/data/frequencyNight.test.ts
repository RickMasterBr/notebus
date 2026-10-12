/// <reference types="node" />
/**
 * Frequência que começa na madrugada (E-08 bloco 10, item 2, D-183 regra e, T-127): início de 00:00 a 03:59 conta como
 * fim do dia de serviço anterior (+1440, D-016). Faixa que atravessa as 04:00 é recusada: são duas frequências.
 */
import { DECLARE_NIGHT_CUTOFF_MINUTES, officialId } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { type ImportDb, importMobilis } from "../db/importMobilis";
import { createLine } from "../db/lineCreate";
import { stopTime, tables } from "../db/schema";
import { lineSeed } from "../db/testing/lineSeed";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { frequencyMinutes } from "./frequency";
import { validateLineDraft, type LineDraft } from "./lineDraft";

const S = officialId("mobilis/stop/S");
const A = officialId("mobilis/stop/A");
const K = officialId("mobilis/stop/K");
const NOW = 1_800_000_000_000;

const draft = (frequency: NonNullable<LineDraft["frequency"]>): LineDraft => ({
  code: "N1",
  name: "Linha Coruja",
  color: "#1A73E8",
  pattern: { label: "sentido Campus", stopIds: [S, A, K] },
  durationMinutes: 20,
  dayTypeCodes: ["weekday"],
  frequency,
});

const time = (hour: number, minute: number) => hour * 60 + minute;
const range = (from: number, to: number, headwayMinutes = 30) => ({ fromMinute: from, toMinute: to, headwayMinutes });

describe("frequência na madrugada (D-183 regra e)", () => {
  it("o corte é o da declaração: 04:00 (240)", () => {
    expect(DECLARE_NIGHT_CUTOFF_MINUTES).toBe(240);
  });

  it("00:30 a cada 30 min até 03:00 → 1470, 1500, ..., 1620", () => {
    const r = validateLineDraft(draft(range(time(0, 30), time(3, 0))));
    if (!r.ok) throw new Error(r.reasons.join());
    expect(r.value.departureMinutes).toEqual([1470, 1500, 1530, 1560, 1590, 1620]);
    expect(r.value.frequency).toMatchObject({ fromMinute: 1470, toMinute: 1620, headwayMinutes: 30 });
  });

  it("início às 03:59 conta como noite", () => {
    const r = validateLineDraft(draft(range(time(3, 59), time(3, 59))));
    if (!r.ok) throw new Error(r.reasons.join());
    expect(r.value.departureMinutes).toEqual([1679]);
  });

  it("início às 04:00 não desloca", () => {
    const r = validateLineDraft(draft(range(time(4, 0), time(5, 0))));
    if (!r.ok) throw new Error(r.reasons.join());
    expect(r.value.departureMinutes).toEqual([240, 270, 300]);
    expect(r.value.frequency).toMatchObject({ fromMinute: 240, toMinute: 300 });
  });

  it("02:00 a 05:00 atravessa a virada do dia de serviço → crosses_cutoff", () => {
    expect(validateLineDraft(draft(range(time(2, 0), time(5, 0))))).toEqual({ ok: false, reasons: ["crosses_cutoff"] });
    expect(validateLineDraft(draft(range(time(3, 59), time(4, 0))))).toEqual({ ok: false, reasons: ["crosses_cutoff"] });
  });

  it("início de madrugada com fim antes do início (03:00 a 01:00) dá a volta pelas 04:00 → crosses_cutoff", () => {
    expect(validateLineDraft(draft(range(time(3, 0), time(1, 0))))).toEqual({ ok: false, reasons: ["crosses_cutoff"] });
  });

  it("23:00 a 02:00 (início de noite, dá a volta) continua aceita como antes: 1380 a 1560", () => {
    const r = validateLineDraft(draft(range(time(23, 0), time(2, 0))));
    if (!r.ok) throw new Error(r.reasons.join());
    expect(r.value.departureMinutes).toEqual([1380, 1410, 1440, 1470, 1500, 1530, 1560]);
    expect(r.value.frequency?.toMinute).toBe(1560);
  });

  it("os outros motivos de antes não mudam de lugar", () => {
    expect(validateLineDraft(draft(range(time(0, 0), time(5, 0), 1))).ok).toBe(false);
    expect(validateLineDraft(draft(range(time(0, 0), time(2, 0), 0)))).toEqual({ ok: false, reasons: ["invalid_headway"] });
    expect(validateLineDraft(draft(range(time(0, 0), 1440)))).toEqual({ ok: false, reasons: ["invalid_range"] });
  });

  it("frequencyMinutes sozinho: início antes das 04:00 devolve minutos de serviço", () => {
    const r = frequencyMinutes(range(time(0, 30), time(3, 0)));
    expect(r).toEqual({ ok: true, minutes: [1470, 1500, 1530, 1560, 1590, 1620] });
  });

  it("createLine com 00:30 a 03:00 grava stop_time em 1470, 1500, ... na primeira paragem", async () => {
    const { db, sqlite } = testDbWithSqlite();
    const raw: ImportDb = {
      exec: async (sql) => sqlite.exec(sql),
      run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
      all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
    };
    await importMobilis(
      raw,
      lineSeed({ S: "Estação Inventada", A: "Arrabalde Inventado", K: "Campus Exemplo" }, [
        { code: "1", color: "#7CB342", stops: [{ stop: "S", timepoint: true }, { stop: "A" }, { stop: "K", timepoint: true }], trips: [{ id: "0810", days: ["weekday"], times: { 1: 490, 3: 520 } }] },
      ]),
    );
    const res = await createLine(db, draft(range(time(0, 30), time(3, 0))), NOW);
    if (!res.ok) throw new Error(res.reason);

    const first = (await db.select().from(tables.patternStop)).find((p) => p.patternId === res.patternId && p.position === 1)!;
    const rows = (await db.select().from(stopTime)).filter((s) => s.patternStopId === first.id);
    expect(rows.map((r) => r.serviceMinute).sort((a, b) => a - b)).toEqual([1470, 1500, 1530, 1560, 1590, 1620]);
    const [freq] = await db.select().from(tables.frequency);
    expect(freq).toMatchObject({ fromMinute: 1470, toMinute: 1620 });
  });
});

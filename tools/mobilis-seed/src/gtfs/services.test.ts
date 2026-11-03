import { describe, expect, it } from "vitest";
import { calendarExceptions, feedEnd, SERVICES, serviceRule } from "./services.ts";
import type { GtfsFeed } from "./types.ts";

const CUTOFF = "2026-11-01";
const WEEK = ["1", "1", "1", "1", "1", "0", "0"];
const SAT = ["0", "0", "0", "0", "0", "1", "0"];
const SUN = ["0", "0", "0", "0", "0", "0", "1"];

const HOL_OFF = ["A-U", "AX2431-U"].flatMap((servico) =>
  ["20261201", "20261208", "20261225", "20270101"].map((data) => ({ servico, data, tipo: "2" })),
);

function feed(over: Partial<GtfsFeed> = {}): GtfsFeed {
  return {
    info: { versao: "t", inicio: "20260101", fim: "20270131" },
    rotas: [],
    viagens: [],
    horarios: [],
    paradas: [],
    calendario: [
      { servico: "A-U", dias: WEEK, inicio: "20260101", fim: "20270131" },
      { servico: "AX2431-U", dias: WEEK, inicio: "20260101", fim: "20270131" },
      { servico: "A-S", dias: SAT, inicio: "20260101", fim: "20270131" },
      { servico: "A-DF", dias: SUN, inicio: "20260101", fim: "20270131" },
    ],
    ...over,
    // O feed inventado tira os feriados nacionais dos dois serviços de dia útil, como o app.
    excecoes: [...HOL_OFF, ...(over.excecoes ?? [])],
  };
}
const run = (f: GtfsFeed, id: string, cutoff = CUTOFF) => {
  const r = calendarExceptions(f, id, cutoff, []);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

describe("tabela dos 7 serviços", () => {
  it("dá tipo de dia, época e código de dias de cada id", () => {
    const summer = { startMd: "07-01", endMd: "08-31" };
    const util = { dayType: "weekday", days: "util" };
    expect(Object.keys(SERVICES)).toHaveLength(7);
    expect(SERVICES).toEqual({
      "A-U": { ...util, season: null },
      "AX2431-U": { ...util, season: null },
      "XJA1-U": { ...util, season: { ...summer, mode: "exclude" } },
      "XJA4-U": { ...util, season: { ...summer, mode: "exclude" } },
      "JA-U": { ...util, season: { ...summer, mode: "include" } },
      "A-S": { dayType: "saturday", days: "sab", season: null },
      "A-DF": { dayType: "sunday_holiday", days: "dom-fer", season: null },
    });
  });

  it("id fora da tabela é SERVICO_DESCONHECIDO (também 'toString')", () => {
    for (const id of ["Z-U", "toString"]) {
      const r = serviceRule(id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("SERVICO_DESCONHECIDO");
    }
    const e = calendarExceptions(feed(), "Z-U", CUTOFF, []);
    expect(e.ok).toBe(false);
  });
});

describe("exceções de data", () => {
  it("(i) A-DF sem serviço no feriado nacional 2026-12-25 → notOn, sem alsoOn", () => {
    const r = run(feed(), "A-DF");
    expect(r.notOn).toContain("2026-12-25");
    expect(r.alsoOn).toEqual([]);
  });

  it("(ii) calendar_dates tipo 2 em 24/12 e 31/12 → notOn do AX2431-U", () => {
    const f = feed({
      excecoes: [
        { servico: "AX2431-U", data: "20261224", tipo: "2" },
        { servico: "AX2431-U", data: "20261231", tipo: "2" },
      ],
    });
    const r = run(f, "AX2431-U");
    expect(r.notOn).toContain("2026-12-24");
    expect(r.notOn).toContain("2026-12-31");
    expect(run(f, "A-U").notOn).not.toContain("2026-12-24");
  });

  it("(iii) acréscimo tipo 1 num sábado comum para o A-U → alsoOn", () => {
    const f = feed({ excecoes: [{ servico: "A-U", data: "20261114", tipo: "1" }] });
    expect(run(f, "A-U").alsoOn).toEqual(["2026-11-14"]);
  });

  it("(iv) feed e app iguais (feriado que o feed também remove) → nenhuma exceção", () => {
    const f = feed({
      excecoes: ["20261125", "20261201", "20261208", "20261225"].map((data) => ({ servico: "A-U", data, tipo: "2" })),
    });
    // 01/12 e 25/12 são feriados nacionais (app não circula em dia útil); 08/12 também; 25/11 é só uma quarta.
    const r = run(f, "A-U");
    expect(r.notOn).toEqual(["2026-11-25"]);
    expect(r.alsoOn).toEqual([]);
    const g = feed({ excecoes: ["20261201", "20261208", "20261225"].map((data) => ({ servico: "A-U", data, tipo: "2" })) });
    expect(run(g, "A-U")).toEqual({ notOn: [], alsoOn: [] });
  });

  it("feriado municipal gravado entra na regra do app", () => {
    const hol = [{ id: "x", key: "mobilis/holiday/2026-11-18", date: "2026-11-18", name: "Municipal", scope: "municipal" as const }];
    const f = feed({ excecoes: [{ servico: "A-U", data: "20261118", tipo: "2" }] });
    const r = calendarExceptions(f, "A-U", CUTOFF, hol);
    expect(r.ok && r.value).toEqual({ notOn: [], alsoOn: [] });
  });

  it("(v) antes do corte e depois do fim do feed não aparecem", () => {
    const f = feed({
      excecoes: [
        { servico: "A-U", data: "20261024", tipo: "1" }, // antes do corte (sábado)
        { servico: "A-U", data: "20270206", tipo: "1" }, // depois do fim (sábado)
      ],
    });
    const r = run(f, "A-U");
    expect(r.alsoOn).toEqual([]);
    expect(r.notOn.every((d) => d >= CUTOFF && d <= "2027-01-31")).toBe(true);
    expect(feedEnd(f)).toBe("2027-01-31");
  });

  it("data fora do intervalo do calendar é notOn (o intervalo conta)", () => {
    const f = feed({ calendario: [{ servico: "A-U", dias: WEEK, inicio: "20260101", fim: "20261130" }] });
    const r = run(f, "A-U");
    expect(r.notOn).toContain("2026-12-02"); // quarta, o feed já acabou para o serviço
    expect(r.notOn).not.toContain("2026-11-30");
  });

  it("(vi) listas em ordem crescente; sem info, o fim vem do calendar", () => {
    const f = feed({
      info: null,
      excecoes: [
        { servico: "A-U", data: "20261128", tipo: "1" },
        { servico: "A-U", data: "20261121", tipo: "1" },
        { servico: "A-U", data: "20261214", tipo: "2" },
        { servico: "A-U", data: "20261103", tipo: "2" },
      ],
    });
    const r = run(f, "A-U");
    expect(r.alsoOn).toEqual(["2026-11-21", "2026-11-28"]);
    expect(r.notOn).toEqual(["2026-11-03", "2026-12-14"]);
    expect(r.notOn).toEqual([...r.notOn].sort());
  });

  it("época: JA-U (include) só circula em julho e agosto", () => {
    const f = feed({ calendario: [{ servico: "JA-U", dias: WEEK, inicio: "20260101", fim: "20270131" }] });
    const r = calendarExceptions(f, "JA-U", "2027-06-28", []);
    expect(r.ok).toBe(true);
    const g = feed({ info: { versao: "t", inicio: "20260101", fim: "20270710" }, calendario: [{ servico: "JA-U", dias: WEEK, inicio: "20260101", fim: "20270710" }] });
    const h = calendarExceptions(g, "JA-U", "2027-06-28", []);
    // 28/06 a 30/06 o app não circula e o feed sim → alsoOn; de 01/07 em diante batem.
    expect(h.ok && h.value.alsoOn).toEqual(["2027-06-28", "2027-06-29", "2027-06-30"]);
    expect(h.ok && h.value.notOn).toEqual([]);
  });
});

describe("exceções de data: bordas do intervalo", () => {
  it("o corte e o último dia do feed (ambos domingos) entram em alsoOn", () => {
    const f = feed({
      excecoes: [
        { servico: "A-U", data: "20261101", tipo: "1" }, // o próprio corte
        { servico: "A-U", data: "20270131", tipo: "1" }, // o último dia do feed
      ],
    });
    expect(run(f, "A-U").alsoOn).toEqual(["2026-11-01", "2027-01-31"]);
  });
});

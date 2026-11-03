import { describe, expect, it } from "vitest";
import { officialId } from "@notebus/domain/src/ids.ts";
import { parseSeedFile } from "@notebus/domain/src/seedFormat.ts";
import { reuseKeys } from "./reuse.ts";
import type { SeedFile } from "./types.ts";

interface Spec {
  code: string;
  stops: string[];
  ctl?: number[]; // posições de controle (padrão: primeira e última)
  starts: number[]; // minuto de partida de cada viagem
  season?: "exclude" | null;
  notOn?: string[];
  label?: string;
}

const k = (key: string) => ({ id: officialId(key), key });

/** Arquivo inventado; `ver` é a vigência de origem das chaves, `fmt` o formato. */
function seedOf(ver: string, specs: Spec[], fmt: 1 | 2 = 2): SeedFile {
  const seed: SeedFile = {
    format: "notebus.mobilis-seed",
    formatVersion: fmt,
    network: { name: "Rede Exemplo", timezone: "Europe/Lisbon" },
    dataset: { name: "exemplo", version: ver },
    stops: [],
    lines: [{ ...k("mobilis/line/1"), code: "1", name: "Linha Um", color: "#111111" }],
    patterns: [],
    patternStops: [],
    timetables: [],
    trips: [],
    stopTimes: [],
  };
  for (const s of specs) {
    for (const st of s.stops) if (!seed.stops.some((x) => x.key === `mobilis/stop/${st}`)) seed.stops.push({ ...k(`mobilis/stop/${st}`), name: st, aliases: [], externalId: null });
    const pk = `mobilis/${ver}/pattern/${s.code}`;
    const pattern = { ...k(pk), code: s.code, lineId: officialId("mobilis/line/1"), label: "Ida", isCircular: false };
    seed.patterns.push(pattern);
    const tt = { ...k(`mobilis/${ver}/timetable/${s.code}`), patternId: pattern.id, validFrom: ver, validTo: null } as const;
    seed.timetables.push(tt);
    const ctl = s.ctl ?? [1, s.stops.length];
    s.stops.forEach((st, i) => {
      const isTimepoint = ctl.includes(i + 1);
      seed.patternStops.push({
        ...k(`${pk}/pos/${i + 1}`),
        patternId: pattern.id,
        position: i + 1,
        stopId: officialId(`mobilis/stop/${st}`),
        isTimepoint,
        timepointLabel: isTimepoint ? (s.label ?? st) : null,
      });
    });
    for (const start of s.starts) {
      const tk = `mobilis/${ver}/trip/${s.code}/util/${String(start).padStart(4, "0")}-p1`;
      const trip = {
        ...k(tk),
        timetableId: tt.id,
        firstPosition: 1,
        lastPosition: s.stops.length,
        dayTypes: ["weekday" as const],
        season: s.season ? { startMd: "07-01", endMd: "08-31", mode: s.season } : null,
        ...(s.notOn && fmt === 2 ? { notOn: [...s.notOn] } : {}),
        sourceTable: 0,
      };
      seed.trips.push(trip);
      for (const pos of ctl) seed.stopTimes.push({ ...k(`${tk}/pos/${pos}`), tripId: trip.id, patternStopId: officialId(`${pk}/pos/${pos}`), serviceMinute: start + 10 * (pos - 1) });
    }
  }
  return seed;
}

const L1: Spec = { code: "L1", stops: ["a", "b", "c", "d"], starts: [480, 540], notOn: ["2026-12-01"] };
const L2: Spec = { code: "L2", stops: ["a", "c", "e"], starts: [600] };
const PREV = "2026-09-01";
const NEXT = "2026-11-01";
const verdictOf = (r: ReturnType<typeof reuseKeys>, code: string) => r.verdicts.find((v) => v.code === code)!;

describe("reuseKeys: percurso que não mudou", () => {
  const prev = seedOf(PREV, [L1, L2]);
  const next = seedOf(NEXT, [{ ...L1, notOn: ["2026-12-01", "2026-12-08"] }, L2]);
  const r = reuseKeys(next, prev);

  it("sai com as chaves e IDs do anterior (percurso, paragens, quadro, viagens, horários) e o validFrom do anterior", () => {
    expect(verdictOf(r, "L1")).toEqual({ code: "L1", status: "kept" });
    for (const list of ["patterns", "patternStops", "timetables", "trips", "stopTimes"] as const) {
      expect(r.seed[list].map((x) => x.key).sort()).toEqual(prev[list].map((x) => x.key).sort());
      expect(r.seed[list].map((x) => x.id).sort()).toEqual(prev[list].map((x) => x.id).sort());
    }
    expect(r.seed.timetables.every((t) => t.validFrom === PREV)).toBe(true);
    expect(r.seed.dataset.version).toBe(NEXT);
  });

  it("mantém as exceções de data novas das viagens", () => {
    const l1 = r.seed.trips.filter((t) => t.key.includes("/L1/"));
    expect(l1.every((t) => t.notOn!.join() === "2026-12-01,2026-12-08")).toBe(true);
  });

  it("a saída passa parseSeedFile", () => {
    expect(() => parseSeedFile(JSON.parse(JSON.stringify(r.seed)))).not.toThrow();
  });

  it("anterior do formato 1 também funciona", () => {
    const old = seedOf(PREV, [{ ...L1, notOn: undefined }, L2], 1);
    const out = reuseKeys(next, old);
    expect(out.verdicts.map((v) => v.status)).toEqual(["kept", "kept"]);
    expect(out.seed.patterns.map((p) => p.key)).toEqual(old.patterns.map((p) => p.key));
    expect(() => parseSeedFile(JSON.parse(JSON.stringify(out.seed)))).not.toThrow();
  });

  it("exceção do anterior com data antes do corte novo não conta como sumida", () => {
    const old = seedOf(PREV, [{ ...L1, notOn: ["2026-10-05", "2026-12-01"] }, L2]);
    expect(verdictOf(reuseKeys(next, old), "L1").status).toBe("kept");
  });

  it("timepointLabel diferente não muda o veredito", () => {
    const out = reuseKeys(seedOf(NEXT, [{ ...L1, label: "Outro texto" }, L2]), seedOf(PREV, [L1, L2]));
    expect(verdictOf(out, "L1").status).toBe("kept");
  });
});

describe("reuseKeys: percurso que mudou, novo e removido", () => {
  const prev = seedOf(PREV, [L1, L2]);
  const cases: [string, Spec, string][] = [
    ["um ponto trocado", { ...L1, stops: ["a", "b", "x", "d"] }, "pontos"],
    ["um ponto de controle a mais", { ...L1, ctl: [1, 2, 4] }, "controle"],
    ["uma viagem a mais", { ...L1, starts: [480, 540, 600] }, "viagens_diferentes"],
    ["um horário diferente", { ...L1, starts: [480, 545] }, "viagens_diferentes"],
    ["a época diferente", { ...L1, season: "exclude" }, "viagens_diferentes"],
    ["uma exceção do anterior que sumiu", { ...L1, notOn: undefined }, "excecao_removida"],
  ];
  for (const [title, spec, reason] of cases) {
    it(`${title} → changed com o motivo e chaves novas`, () => {
      const next = seedOf(NEXT, [spec, L2]);
      const r = reuseKeys(next, prev);
      const v = verdictOf(r, "L1");
      expect(v.status).toBe("changed");
      expect(v.status === "changed" && v.reasons).toContain(reason);
      expect(r.seed.patterns.find((p) => p.code === "L1")!.key).toBe(`mobilis/${NEXT}/pattern/L1`);
      expect(r.seed.trips.filter((t) => t.key.includes("/L1/")).every((t) => t.key.startsWith(`mobilis/${NEXT}/`))).toBe(true);
      expect(verdictOf(r, "L2").status).toBe("kept");
    });
  }

  it("só no novo é new, só no anterior é removed", () => {
    const r = reuseKeys(seedOf(NEXT, [L1, { ...L2, code: "L3" }]), prev);
    expect(r.verdicts).toEqual([{ code: "L1", status: "kept" }, { code: "L2", status: "removed" }, { code: "L3", status: "new" }]);
  });

  it("reaproveitar não altera os outros percursos", () => {
    const next = seedOf(NEXT, [{ ...L1, starts: [480] }, L2]);
    const r = reuseKeys(next, prev);
    expect(r.seed.patterns.find((p) => p.code === "L1")).toEqual(next.patterns.find((p) => p.code === "L1"));
    expect(r.seed.trips.filter((t) => t.key.includes("/L1/"))).toEqual(next.trips.filter((t) => t.key.includes("/L1/")));
    expect(r.seed.stops).toEqual(next.stops);
    expect(r.seed.lines).toEqual(next.lines);
  });
});

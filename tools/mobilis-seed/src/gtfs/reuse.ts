/** Camada A (parecer do ADR-0007 §1.3): o percurso que não mudou sai com as chaves e IDs do arquivo anterior. Pura. */
import type { SeedFile } from "./types.ts";

export type PatternVerdict =
  | { code: string; status: "kept" }
  | { code: string; status: "changed"; reasons: string[] } // 'pontos', 'controle', 'viagens_diferentes', 'excecao_removida'
  | { code: string; status: "new" } // existe só no arquivo gerado
  | { code: string; status: "removed" }; // existe só no anterior

type Trip = SeedFile["trips"][number];
type StopTime = SeedFile["stopTimes"][number];
type PatternStop = SeedFile["patternStops"][number];
type Timetable = SeedFile["timetables"][number];

interface Pat {
  pattern: SeedFile["patterns"][number];
  stops: PatternStop[]; // por posição
  timetables: Timetable[];
  trips: { trip: Trip; times: (StopTime & { position: number })[]; sig: string }[];
}

function index(seed: SeedFile): Map<string, Pat> {
  const out = new Map<string, Pat>();
  const psById = new Map(seed.patternStops.map((p) => [p.id, p]));
  for (const pattern of seed.patterns) {
    const timetables = seed.timetables.filter((t) => t.patternId === pattern.id);
    const ttIds = new Set(timetables.map((t) => t.id));
    const trips = seed.trips
      .filter((t) => ttIds.has(t.timetableId))
      .map((trip) => {
        const times = seed.stopTimes
          .filter((s) => s.tripId === trip.id)
          .map((s) => ({ ...s, position: psById.get(s.patternStopId)?.position ?? -1 }))
          .sort((a, b) => a.position - b.position);
        // sem timepointLabel, label nem sourceTable (decisão c) e sem exceções (decisão d)
        const season = trip.season ? [trip.season.startMd, trip.season.endMd, trip.season.mode] : null;
        const sig = JSON.stringify([trip.dayTypes, season, trip.firstPosition, trip.lastPosition, times.map((t) => [t.position, t.serviceMinute])]);
        return { trip, times, sig };
      })
      .sort((a, b) => (a.trip.key < b.trip.key ? -1 : a.trip.key > b.trip.key ? 1 : 0));
    out.set(pattern.code, {
      pattern,
      stops: seed.patternStops.filter((p) => p.patternId === pattern.id).sort((a, b) => a.position - b.position),
      timetables,
      trips,
    });
  }
  return out;
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** O novo ainda tem toda data do anterior que vale a partir do corte? */
const keeps = (before: string[] | undefined, after: string[] | undefined, cutoff: string) => (before ?? []).every((d) => d < cutoff || !!after?.includes(d));

/** Compara um percurso do gerado com o do anterior; devolve os motivos e, se igual, o pareamento das viagens. */
function compare(n: Pat, p: Pat, cutoff: string): { reasons: string[]; pairs: [Pat["trips"][number], Pat["trips"][number]][] } {
  const reasons: string[] = [];
  if (!sameList(n.stops.map((s) => `${s.position}:${s.stopId}`), p.stops.map((s) => `${s.position}:${s.stopId}`))) reasons.push("pontos");
  else if (!sameList(n.stops.map((s) => String(s.isTimepoint)), p.stops.map((s) => String(s.isTimepoint)))) reasons.push("controle");

  const pairs: [Pat["trips"][number], Pat["trips"][number]][] = [];
  const bySig = (list: Pat["trips"]) => {
    const m = new Map<string, Pat["trips"]>();
    for (const t of list) m.set(t.sig, [...(m.get(t.sig) ?? []), t]);
    return m;
  };
  const nm = bySig(n.trips);
  const pm = bySig(p.trips);
  let tripsEqual = p.timetables.length === 1 && n.timetables.length === 1 && n.trips.length === p.trips.length && nm.size === pm.size;
  for (const [sig, nl] of nm) {
    const pl = pm.get(sig);
    if (!pl || pl.length !== nl.length) tripsEqual = false;
    else nl.forEach((t, i) => pairs.push([t, pl[i]!]));
  }
  if (!tripsEqual) reasons.push("viagens_diferentes");
  // datas antes do corte novo não existem no arquivo novo por construção (generateSeed só olha do corte em diante): não contam como sumidas
  else if (pairs.some(([t, o]) => !keeps(o.trip.notOn, t.trip.notOn, cutoff) || !keeps(o.trip.alsoOn, t.trip.alsoOn, cutoff))) {
    reasons.push("excecao_removida");
  }
  return { reasons, pairs };
}

export function reuseKeys(next: SeedFile, previous: SeedFile): { seed: SeedFile; verdicts: PatternVerdict[] } {
  const nIdx = index(next);
  const pIdx = index(previous);
  const verdicts: PatternVerdict[] = [];
  const kept = new Map<string, { n: Pat; p: Pat; pairs: ReturnType<typeof compare>["pairs"] }>(); // por id do percurso novo

  for (const code of [...new Set([...nIdx.keys(), ...pIdx.keys()])].sort()) {
    const n = nIdx.get(code);
    const p = pIdx.get(code);
    if (!n) verdicts.push({ code, status: "removed" });
    else if (!p) verdicts.push({ code, status: "new" });
    else {
      const { reasons, pairs } = compare(n, p, next.dataset.version);
      if (reasons.length) verdicts.push({ code, status: "changed", reasons });
      else {
        verdicts.push({ code, status: "kept" });
        kept.set(n.pattern.id, { n, p, pairs });
      }
    }
  }

  const tripOf = new Map<string, Pat["trips"][number]>(); // id da viagem nova → a do anterior
  const ttOf = new Map<string, Timetable>(); // id do quadro novo → quadro do anterior
  const psOf = new Map<string, PatternStop>(); // id da paragem nova → a do anterior
  for (const [, k] of kept) {
    ttOf.set(k.n.timetables[0]!.id, k.p.timetables[0]!);
    for (const s of k.n.stops) psOf.set(s.id, k.p.stops.find((x) => x.position === s.position)!);
    for (const [t, o] of k.pairs) tripOf.set(t.trip.id, o);
  }

  const seed: SeedFile = {
    ...next,
    patterns: next.patterns.map((p) => {
      const k = kept.get(p.id);
      return k ? { ...p, id: k.p.pattern.id, key: k.p.pattern.key } : p;
    }),
    patternStops: next.patternStops.map((s) => {
      const o = psOf.get(s.id);
      return o ? { ...s, id: o.id, key: o.key, patternId: o.patternId } : s;
    }),
    timetables: next.timetables.map((t) => {
      const o = ttOf.get(t.id);
      return o ? { ...t, id: o.id, key: o.key, patternId: o.patternId, validFrom: o.validFrom } : t;
    }),
    trips: next.trips.map((t) => {
      const o = tripOf.get(t.id);
      return o ? { ...t, id: o.trip.id, key: o.trip.key, timetableId: o.trip.timetableId } : t;
    }),
    stopTimes: next.stopTimes.map((s) => {
      const o = tripOf.get(s.tripId);
      if (!o) return s;
      const ps = psOf.get(s.patternStopId)!;
      const old = o.times.find((x) => x.patternStopId === ps.id)!;
      return { ...s, id: old.id, key: old.key, tripId: o.trip.id, patternStopId: ps.id };
    }),
  };
  return { seed, verdicts };
}

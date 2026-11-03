/** `generateSeed`: feed GTFS já lido + configuração da rede + corte → SeedFile do formato 2. Pura, sem disco nem relógio. */
import { officialId } from "@notebus/domain/src/ids.ts";
import { checkPatternPositions, checkTripTimes } from "@notebus/domain/src/invariants.ts";
import { checkHolidays, isRealDate, parseSeedFile, SeedFormatError } from "@notebus/domain/src/seedFormat.ts";
import { duplicateKeys } from "../build.ts";
import { analyzeRoute } from "./patterns.ts";
import { calendarExceptions, feedEnd, serviceRule } from "./services.ts";
import type { GenError, GenerateResult, GtfsFeed, NetworkConfig, SeedFile, Warning } from "./types.ts";

const issue = (code: string, message: string, items: string[]): Warning => ({ code, message, items });

/** Junta os avisos de mesmo código (itens na ordem em que chegaram). */
function merge(list: Warning[]): Warning[] {
  const byCode = new Map<string, Warning>();
  for (const w of list) {
    const seen = byCode.get(w.code);
    if (seen) seen.items.push(...w.items);
    else byCode.set(w.code, { ...w, items: [...w.items] });
  }
  return [...byCode.values()];
}

export function generateSeed(feed: GtfsFeed, config: NetworkConfig, cutoff: string): GenerateResult {
  const errors: GenError[] = [];
  const warnings: Warning[] = [];
  const fail = (): GenerateResult => ({ ok: false, errors: merge(errors), warnings: merge(warnings) });

  if (!isRealDate(cutoff)) {
    errors.push(issue("CORTE_INVALIDO", `o corte não é uma data AAAA-MM-DD real: ${cutoff}`, [cutoff]));
    return fail();
  }
  const end = feedEnd(feed);
  if (end === null || cutoff > end) {
    errors.push(issue("CORTE_FORA_DO_FEED", `o corte ${cutoff} é depois do fim do feed (${end ?? "sem fim"})`, [cutoff]));
    return fail();
  }

  const k = (key: string) => ({ id: officialId(key), key });
  const seed: SeedFile = {
    format: "notebus.mobilis-seed",
    formatVersion: 2,
    network: config.network,
    dataset: { name: config.datasetName, version: cutoff },
    stops: [],
    lines: config.lines.map((l) => ({ ...k(`mobilis/line/${l.number}`), code: l.number, name: l.name, color: l.color })),
    patterns: [],
    patternStops: [],
    timetables: [],
    trips: [],
    stopTimes: [],
    holidays: [...config.holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => ({ ...h })),
  };
  const holidayProblems = checkHolidays(seed.holidays!);
  if (holidayProblems.length) errors.push(issue("FERIADO_INVALIDO", "feriados da configuração inválidos", holidayProblems));

  // ---------- Rotas do feed × percursos da configuração
  const feedRoutes = new Set(feed.rotas.map((r) => r.id));
  const configRoutes = new Set(config.patterns.map((p) => p.routeId));
  const ignored = [...feedRoutes].filter((r) => !configRoutes.has(r));
  if (ignored.length) warnings.push(issue("ROTA_IGNORADA", "rotas do feed sem entrada na configuração", ignored));
  const missing = config.patterns.filter((p) => !feedRoutes.has(p.routeId));
  if (missing.length) errors.push(issue("ROTA_AUSENTE", "percursos da configuração sem rota no feed", missing.map((p) => `${p.code}: ${p.routeId}`)));
  const noLine = config.patterns.filter((p) => !config.lines.some((l) => l.number === p.line));
  if (noLine.length) errors.push(issue("LINHA_AUSENTE", "percursos com linha fora da configuração", noLine.map((p) => `${p.code}: ${p.line}`)));

  // ---------- Pontos: tabela de equivalência, senão o stop_code (se único)
  const paradaById = new Map(feed.paradas.map((p) => [p.id, p]));
  const codeCount = new Map<string, number>();
  for (const p of feed.paradas) codeCount.set(p.codigo, (codeCount.get(p.codigo) ?? 0) + 1);
  const stopOf = new Map<string, SeedFile["stops"][number]>();
  const noMatch = new Set<string>();
  const noStop = new Set<string>();
  function resolveStop(paradaId: string): SeedFile["stops"][number] | undefined {
    const known = stopOf.get(paradaId);
    if (known) return known;
    const parada = paradaById.get(paradaId);
    if (!parada) {
      noStop.add(paradaId);
      return undefined;
    }
    const entry = config.stops.find((s) => s.stopId === paradaId);
    const code = parada.codigo.trim();
    if (!entry && (code === "" || codeCount.get(parada.codigo) !== 1)) {
      noMatch.add(`${paradaId} (${code === "" ? "código vazio" : `código repetido ${code}`})`);
      return undefined;
    }
    const key = entry ? entry.key : `mobilis/stop/${code}`;
    const stop = {
      ...k(key),
      name: entry ? entry.name : parada.nome,
      aliases: entry ? [...entry.aliases] : [],
      externalId: entry ? entry.externalId : null,
      lat: parada.lat,
      lon: parada.lon,
    };
    stopOf.set(paradaId, stop);
    seed.stops.push(stop);
    return stop;
  }

  // ---------- Percursos, quadros, paragens de percurso, viagens e horários
  const exceptions = new Map<string, { notOn: string[]; alsoOn: string[] }>();
  const unknownServices = new Set<string>();
  for (const p of config.patterns) {
    if (!feedRoutes.has(p.routeId)) continue;
    const route = analyzeRoute(feed, p.routeId);
    warnings.push(...route.warnings);
    errors.push(...route.errors);
    if (route.errors.length) continue;

    const patternKey = `mobilis/${cutoff}/pattern/${p.code}`;
    const pattern = { ...k(patternKey), code: p.code, lineId: officialId(`mobilis/line/${p.line}`), label: p.label, isCircular: p.isCircular };
    seed.patterns.push(pattern);
    const timetableId = officialId(`mobilis/${cutoff}/timetable/${p.code}`);
    seed.timetables.push({ ...k(`mobilis/${cutoff}/timetable/${p.code}`), patternId: pattern.id, validFrom: cutoff, validTo: null });
    const v1 = checkPatternPositions(route.itinerary.map((_, i) => i + 1));
    if (v1) errors.push(issue("INVARIANTE_POSICAO", `${p.code}: ${v1}`, [p.code]));
    route.itinerary.forEach((paradaId, i) => {
      const pos = i + 1;
      const stop = resolveStop(paradaId);
      if (!stop) return; // o erro já está em noStop/noMatch
      const isTimepoint = route.timepoints.has(pos);
      seed.patternStops.push({
        ...k(`${patternKey}/pos/${pos}`),
        patternId: pattern.id,
        position: pos,
        stopId: stop.id,
        isTimepoint,
        timepointLabel: isTimepoint ? stop.name : null,
      });
    });

    const trips = [...route.trips].sort((a, b) => a.times[0]!.serviceMinute - b.times[0]!.serviceMinute || (a.tripId < b.tripId ? -1 : 1));
    for (const t of trips) {
      const rule = serviceRule(t.servico);
      if (!rule.ok) {
        unknownServices.add(t.servico);
        continue;
      }
      let ex = exceptions.get(t.servico);
      if (!ex) {
        const r = calendarExceptions(feed, t.servico, cutoff, seed.holidays!);
        ex = r.ok ? r.value : { notOn: [], alsoOn: [] };
        exceptions.set(t.servico, ex);
      }
      const first = t.times[0]!.serviceMinute;
      const hhmm = String(Math.floor(first / 60)).padStart(2, "0") + String(first % 60).padStart(2, "0");
      const tripKey = `mobilis/${cutoff}/trip/${p.code}/${rule.value.days}/${hhmm}-p${t.firstPosition}`;
      const v2 = checkTripTimes(t.times);
      if (v2) errors.push(issue("INVARIANTE_HORARIO", `${tripKey}: ${v2}`, [t.tripId]));
      const trip = {
        ...k(tripKey),
        timetableId,
        firstPosition: t.firstPosition,
        lastPosition: t.lastPosition,
        dayTypes: [rule.value.dayType],
        season: rule.value.season ? { ...rule.value.season } : null,
        ...(ex.notOn.length ? { notOn: [...ex.notOn] } : {}),
        ...(ex.alsoOn.length ? { alsoOn: [...ex.alsoOn] } : {}),
        sourceTable: 0,
      };
      seed.trips.push(trip);
      for (const st of t.times) {
        seed.stopTimes.push({
          ...k(`${tripKey}/pos/${st.position}`),
          tripId: trip.id,
          patternStopId: officialId(`${patternKey}/pos/${st.position}`),
          serviceMinute: st.serviceMinute,
        });
      }
    }
  }

  if (noStop.size) errors.push(issue("PARADA_INEXISTENTE", "horário ou itinerário com parada fora de stops", [...noStop]));
  if (noMatch.size) errors.push(issue("PARADA_SEM_EQUIVALENCIA", "ponto fora da tabela com stop_code vazio ou repetido", [...noMatch]));
  if (unknownServices.size) errors.push(issue("SERVICO_DESCONHECIDO", "service_id fora da tabela dos 7", [...unknownServices].sort()));
  if (errors.length) return fail();

  const dups = duplicateKeys(seed);
  if (dups.length) {
    errors.push(issue("CHAVE_DUPLICADA", "dois itens com a mesma chave (nada é renomeado em silêncio)", dups));
    return fail();
  }
  try {
    parseSeedFile(seed);
  } catch (e) {
    if (!(e instanceof SeedFormatError)) throw e;
    errors.push(issue("SEED_INVALIDO", e.message, e.problems));
    return fail();
  }
  return { ok: true, seed, warnings: merge(warnings) };
}

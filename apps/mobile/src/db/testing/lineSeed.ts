/**
 * SÓ PARA TESTE. Arquivo de importação **inventado** (nada da MOBILIS, D-091) montado a partir de uma descrição curta:
 * linhas com a lista de paragens do percurso e as viagens com horários por posição. Mesmas chaves da D-086 que o
 * `exampleSeed`. Serve aos testes da folha do ponto (várias linhas, passagens repetidas, tipos de dia, época).
 */
import { type SeedFile, officialId } from "@notebus/domain";

type Trip = SeedFile["trips"][number];

export interface LineSpec {
  code: string;
  color: string;
  /** Paragens do percurso, por ordem (posição 1…n). `timepoint`: ponto de controle marcado. */
  stops: { stop: string; timepoint?: boolean }[];
  trips: {
    /** "0810" etc.; só dá nome à chave. */
    id: string;
    days: Trip["dayTypes"];
    season?: Trip["season"];
    /** Minuto de serviço por posição (só os pontos de controle da tabela). */
    times: Record<number, number>;
    first?: number;
    last?: number;
  }[];
}

const withId = <T extends { key: string }>(x: T) => ({ id: officialId(x.key), ...x });

/** `names`: chave curta da paragem → nome. Paragens com o mesmo nome curto são o mesmo ponto físico (D-084). */
export function lineSeed(names: Record<string, string>, lines: LineSpec[], version = "2026-01-01"): SeedFile {
  const V = `mobilis/${version}`;
  const stops = Object.entries(names).map(([short, name]) =>
    withId({ key: `mobilis/stop/${short}`, name, aliases: [], externalId: null }),
  );
  const stopId = (short: string) => stops.find((s) => s.key === `mobilis/stop/${short}`)!.id;

  const lineRows = lines.map((l) => withId({ key: `mobilis/line/${l.code}`, code: l.code, name: `Linha ${l.code}`, color: l.color }));
  const patterns = lines.map((l, i) =>
    withId({ key: `${V}/pattern/L${l.code}`, code: `L${l.code}`, lineId: lineRows[i]!.id, label: `sentido ${l.code}`, isCircular: false }),
  );
  const patternStops = lines.flatMap((l, i) =>
    l.stops.map((s, p) =>
      withId({
        key: `${V}/pattern/L${l.code}/pos/${p + 1}`,
        patternId: patterns[i]!.id,
        position: p + 1,
        stopId: stopId(s.stop),
        isTimepoint: s.timepoint === true,
        timepointLabel: s.timepoint ? `Ponto ${p + 1}` : null,
      }),
    ),
  );
  const timetables = lines.map((l, i) =>
    withId({ key: `${V}/timetable/L${l.code}`, patternId: patterns[i]!.id, validFrom: version, validTo: null }),
  );
  const trips = lines.flatMap((l, i) =>
    l.trips.map((t, n) =>
      withId({
        key: `${V}/trip/L${l.code}/${t.id}`,
        timetableId: timetables[i]!.id,
        firstPosition: t.first ?? 1,
        lastPosition: t.last ?? l.stops.length,
        dayTypes: t.days,
        season: t.season ?? null,
        sourceTable: n + 1,
      }),
    ),
  );
  const stopTimes = lines.flatMap((l, i) =>
    l.trips.flatMap((t) => {
      const trip = trips.find((x) => x.key === `${V}/trip/L${l.code}/${t.id}`)!;
      return Object.entries(t.times).map(([pos, minute]) =>
        withId({
          key: `${trip.key}/pos/${pos}`,
          tripId: trip.id,
          patternStopId: patternStops.find((ps) => ps.patternId === patterns[i]!.id && ps.position === Number(pos))!.id,
          serviceMinute: minute,
        }),
      );
    }),
  );
  return {
    format: "notebus.mobilis-seed",
    formatVersion: 1,
    network: { name: "Rede Exemplo", timezone: "Europe/Lisbon" },
    dataset: { name: "exemplo", version },
    stops,
    lines: lineRows,
    patterns,
    patternStops,
    timetables,
    trips,
    stopTimes,
  };
}

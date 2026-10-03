/** Geração de dados (seed) fictícios para injeção nos testes automatizados. */
/**
 * SÓ PARA TESTE. Arquivo de importação **inventado** (nada da MOBILIS, D-091), no formato `SeedFile`,
 * com as chaves da D-086: paragens e linhas sem vigência; percursos, quadros, viagens e horários com vigência.
 */
import { officialId, type SeedFile } from "@notebus/domain";

/** Preenche o `id` (UUIDv5) automaticamente a partir do `key` fornecido para as fixtures. */
const withId = <T extends { key: string }>(x: T) => ({ id: officialId(x.key), ...x });

/**
 * Cria um SeedFile completo e válido com dados fictícios para injeção nos testes.
 * A linha 1 inventada possui 3 paradas, uma viagem de dia útil e uma de fim de semana
 * (operando fora da temporada de julho/agosto).
 *
 * @param version - Determina o namespace de vigência, útil para testar migração de dados.
 * @param extraStop - Adiciona ou não uma parada solta para testar diferenças em atualizações.
 * @param holidays - Com os dois feriados municipais inventados (E-02); `false` = arquivo como o da E-01, sem a lista.
 */
export function exampleSeed(version = "2026-09-01", extraStop = false, holidays = true): SeedFile {
  const V = `mobilis/${version}`;
  const stops = [
    withId({ key: "mobilis/stop/9001", name: "Praça Inventada", aliases: ["Praça"], externalId: "9001" }),
    withId({ key: "mobilis/stop/L1/2", name: "Rua Exemplo", aliases: [], externalId: null }),
    withId({ key: "mobilis/stop/L1/3", name: "Largo Fictício", aliases: [], externalId: null }),
    ...(extraStop ? [withId({ key: "mobilis/stop/9002", name: "Rotunda Nova", aliases: [], externalId: "9002" })] : []),
  ];
  const line = withId({ key: "mobilis/line/1", code: "1", name: "Linha Exemplo", color: "#7A3FF2" });
  const pattern = withId({ key: `${V}/pattern/L1`, code: "L1", lineId: line.id, label: "sentido Largo", isCircular: false });
  const patternStops = [stops[0]!, stops[1]!, stops[2]!].map((s, i) =>
    withId({
      key: `${V}/pattern/L1/pos/${i + 1}`,
      patternId: pattern.id,
      position: i + 1,
      stopId: s.id,
      isTimepoint: i !== 1,
      timepointLabel: i !== 1 ? `Ponto ${i + 1}` : null,
    }),
  );
  const timetable = withId({ key: `${V}/timetable/L1`, patternId: pattern.id, validFrom: `${version}`, validTo: null });
  const trip = (hhmm: string, days: SeedFile["trips"][number]["dayTypes"], season: SeedFile["trips"][number]["season"], n: number) =>
    withId({
      key: `${V}/trip/L1/${hhmm}`,
      timetableId: timetable.id,
      firstPosition: 1,
      lastPosition: 3,
      dayTypes: days,
      season,
      sourceTable: n,
    });
  const trips = [
    trip("0810", ["weekday"], null, 1),
    trip("0900", ["saturday", "sunday_holiday"], { startMd: "07-01", endMd: "08-31", mode: "exclude" }, 2),
  ];
  const stopTimes = trips.flatMap((t, ti) =>
    patternStops.map((ps, i) =>
      withId({ key: `${t.key}/pos/${i + 1}`, tripId: t.id, patternStopId: ps.id, serviceMinute: (ti === 0 ? 490 : 540) + i * 7 }),
    ),
  );
  return {
    format: "notebus.mobilis-seed",
    formatVersion: 1,
    network: { name: "Rede Exemplo", timezone: "Europe/Lisbon" },
    dataset: { name: "exemplo", version },
    stops,
    lines: [line],
    patterns: [pattern],
    patternStops,
    timetables: [timetable],
    trips,
    stopTimes,
    ...(holidays
      ? {
          holidays: ["2026-06-13", "2027-06-13"].map((date) =>
            withId({ key: `mobilis/holiday/${date}`, date, name: "Feriado municipal de Exemplo", scope: "municipal" as const }),
          ),
        }
      : {}),
  };
}

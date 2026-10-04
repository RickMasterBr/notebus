/**
 * Passagens (E-02 §3.5, §3.6, §4.3; Fase 1 §4.1; P-04): a que horas cada viagem passa numa paragem, a que horas
 * estar no ponto, o número/origem/destino de cada passagem e a lista "daqui para a frente".
 *
 * Puro: sem banco, sem relógio e sem texto de tela. Quem chama lê o banco e passa os dados já por posição.
 * Minutos são minutos de serviço (D-016) **com decimais**: nada é arredondado dentro do cálculo (T-14);
 * só as funções `displayCenter` e `displayBeAtStop` arredondam, e só para mostrar (D-092).
 */

import type { DayTypeCode } from "./seedFormat.ts";
import { DOMAIN_CONFIG, type DomainConfig } from "./config.ts";
import { ageDays, recordWeight, weightedQuantile } from "./estimate.ts";

// ─── Dados de entrada ───────────────────────────────────────────────────────

/** Uma posição do percurso (`pattern_stop`). `stopId` é o ponto físico (D-084). */
export interface PatternStopData {
  position: number;
  stopId: string;
  isTimepoint: boolean;
}

/** Um percurso com as suas posições (qualquer ordem; as funções ordenam). */
export interface PatternData {
  id: string;
  stops: PatternStopData[];
}

/** Um horário da viagem numa posição (`stop_time`, já com a posição do `pattern_stop`). */
export interface StopTimeData {
  position: number;
  serviceMinute: number;
  origin: "official" | "declared";
}

/** Uma viagem: o trecho que ela faz (`first_position`…`last_position`) e os seus horários. */
export interface TripData {
  id: string;
  patternId: string;
  firstPosition: number;
  lastPosition: number;
  stopTimes: StopTimeData[];
}

// ─── Horário-base (§3.5, Fase 1 §4.1) ───────────────────────────────────────

/** De onde vem o horário-base: tabela, interpolação pela contagem de paragens, ou regra do usuário (E-08). */
export type BaseKind = "official" | "interpolated" | "declared";

export interface BaseTime {
  position: number;
  /** Minuto de serviço com decimais (10:06,5 = 606.5). */
  minute: number;
  kind: BaseKind;
}

/**
 * Horário-base da viagem numa posição, ou `null` se a viagem não passa ali (fora do trecho da viagem parcial).
 * Com `stop_time` na posição: esse horário (`official` ou `declared`, pela origem). Sem: interpola pela contagem de
 * paragens entre os dois horários vizinhos da própria viagem (`interpolated`).
 *
 * Uma posição dentro do trecho mas antes do primeiro horário (ou depois do último) não está coberta pela Fase 1 §4.1:
 * lança erro em vez de inventar. Nos dados de 2026-09-01 toda viagem tem horário na primeira e na última posição.
 */
export function baseTimeAt(trip: TripData, position: number): BaseTime | null {
  if (position < trip.firstPosition || position > trip.lastPosition) return null;
  let before: StopTimeData | undefined;
  let after: StopTimeData | undefined;
  for (const st of trip.stopTimes) {
    if (st.position === position) {
      return { position, minute: st.serviceMinute, kind: st.origin === "declared" ? "declared" : "official" };
    }
    if (st.position < position && (!before || st.position > before.position)) before = st;
    if (st.position > position && (!after || st.position < after.position)) after = st;
  }
  if (!before || !after) {
    throw new Error(`viagem ${trip.id}: posição ${position} sem horário antes e depois (caso fora da Fase 1 §4.1)`);
  }
  const share = (position - before.position) / (after.position - before.position);
  return { position, minute: before.serviceMinute + (after.serviceMinute - before.serviceMinute) * share, kind: "interpolated" };
}

// ─── Horário esperado (§3.5, P-04; E-03 §3.4, D-073, D-120) ─────────────────

/** Confiança (P-04 §3.5, D-120). */
export type Confidence = "estimated" | "low" | "medium" | "high";

/** Vínculo de um registro com a viagem (Fase 1 §4.2; `manual` = escolhido por você na TL-09, E-04). */
export type MatchStatus = "auto" | "manual" | "ambiguous" | "orphan";

/**
 * Um registro já deduzido, como a estatística o lê. Quem chama passa os registros da linha (de qualquer viagem e
 * ponto); a função escolhe o nível. Só `auto` e `manual` entram (D-022); o `kind` não muda o peso (D-073).
 */
export interface PassageRecord {
  /** Minutos depois da base (+) ou antes (−), com decimais. */
  deviation: number;
  /** Instante observado (epoch ms UTC), para a recência. */
  observedAt: number;
  /** Dia de serviço (`AAAA-MM-DD`) e o seu tipo de dia. */
  serviceDate: string;
  dayType: DayTypeCode;
  /** A passagem a que o registro foi ligado: viagem, percurso, posição e ponto físico. */
  tripId: string;
  patternId: string;
  position: number;
  stopId: string;
  matchStatus: MatchStatus;
  mode: "live" | "later" | "memory";
  kind: "boarded" | "passed" | "alighted";
}

/** A passagem cujo horário se quer, para a escolha do nível (P-04 §3.1). Obrigatória quando há registros. */
export interface PassageTarget {
  tripId: string;
  patternId: string;
  position: number;
  stopId: string;
  dayType: DayTypeCode;
  /** Início da vigência atual da tabela da viagem (`AAAA-MM-DD`): registros de antes pesam 0,25. */
  validFrom: string | null;
}

export interface ExpectedTimeOptions {
  /** Minutos antes do início da faixa para estar no ponto. Padrão `config.marginMinutes` (D-019). */
  marginMinutes?: number;
  /** A passagem pedida. Obrigatória se `records` não for vazio. */
  target?: PassageTarget;
  /** "Agora" (epoch ms UTC), para a recência. Obrigatório se `records` não for vazio. */
  now?: number;
  /** Parâmetros; padrão `DOMAIN_CONFIG`. */
  config?: DomainConfig;
}

export interface ExpectedTime {
  /** Minutos com decimais; arredonde só para mostrar (`displayCenter`, `displayBeAtStop`). */
  center: number;
  rangeStart: number;
  rangeEnd: number;
  confidence: Confidence;
  baseKind: BaseKind;
  /** "Esteja no ponto às" = início da faixa − margem. */
  beAtStop: number;
}

/** Incerteza da base em minutos, para cada lado (P-04). Vem da configuração única. */
export const BASE_UNCERTAINTY: Readonly<Record<BaseKind, number>> = DOMAIN_CONFIG.baseUncertainty;
/** Margem padrão do "esteja no ponto" (D-019, P-04). Vem da configuração única. */
export const DEFAULT_MARGIN_MINUTES = DOMAIN_CONFIG.marginMinutes;

/** Nível de agregação usado para o centro (P-04 §3.1): (a) `trip`, (b) `stop`, (c) `pattern`, (d) `none`. */
export type EstimateLevel = "trip" | "stop" | "pattern" | "none";

/** O detalhe da conta, em desvios (minutos relativos à base). `expectedTime` só converte em horário. */
export interface DeviationEstimate {
  level: EstimateLevel;
  /** Desvio do centro, já encolhido. */
  center: number;
  rangeStart: number;
  rangeEnd: number;
  confidence: Confidence;
  /** Registros aceitos no nível usado (contagem, D-120) e quantos deles são recentes (≤ 56 dias). */
  count: number;
  recentCount: number;
  /** Soma dos pesos do nível usado: o `n` do encolhimento (D-120). */
  weightSum: number;
  /** Mediana ponderada do nível usado e a do nível acima (0 no nível `none`). */
  localMedian: number;
  aboveMedian: number;
}

interface Weighted {
  value: number;
  weight: number;
  observedAt: number;
}

/**
 * Os quatro níveis (P-04 §3.1), do mais específico ao mais geral, sempre no mesmo tipo de dia e no mesmo percurso:
 * (a) a mesma viagem na mesma posição; (b) o mesmo ponto físico, todas as viagens; (c) todos os pontos do percurso.
 * Cada nível contém o anterior.
 */
function levelsOf(target: PassageTarget, records: readonly PassageRecord[]): Record<Exclude<EstimateLevel, "none">, PassageRecord[]> {
  const pattern = records.filter((r) => r.patternId === target.patternId && r.dayType === target.dayType);
  const stop = pattern.filter((r) => r.stopId === target.stopId);
  const trip = stop.filter((r) => r.tripId === target.tripId && r.position === target.position);
  return { trip, stop, pattern };
}

/**
 * A estatística do horário esperado sobre o desvio (E-03 §3.4, P-04 §3, D-120):
 * - só `auto` e `manual` entram (D-022); "vi passar" pesa igual a "embarquei" (D-073);
 * - usa o nível mais específico com dados; peso = `recordWeight` (recência × vigência × "de memória");
 * - centro = `(n · mediana_local + k · mediana_acima) / (n + k)`, `n` = soma dos pesos (D-120), medianas ponderadas
 *   (`weightedQuantile` com q = 0,5), `mediana_acima` = a do nível seguinte (0 acima do percurso);
 * - faixa: com menos de 5 registros, do menor ao maior desvio do nível usado, alargada pela incerteza da base;
 *   com 5 ou mais, percentis 10 a 90 ponderados do nível usado (sem alargar);
 * - confiança conta **registros** do nível usado: 0 `estimated`; 1–2 `low`; 3–5 `medium`; 6 ou mais `high` se 6 ou
 *   mais forem dos últimos 56 dias e a faixa tiver até 4 min; senão `medium` (D-120).
 */
export function estimateDeviation(
  baseKind: BaseKind,
  records: readonly PassageRecord[],
  target: PassageTarget,
  now: number,
  config: DomainConfig = DOMAIN_CONFIG,
): DeviationEstimate {
  const accepted = records.filter((r) => r.matchStatus === "auto" || r.matchStatus === "manual");
  const levels = levelsOf(target, accepted);
  const weigh = (rs: PassageRecord[]): Weighted[] =>
    rs.map((r) => ({ value: r.deviation, weight: recordWeight(r, now, target.validFrom, config), observedAt: r.observedAt }));
  const median = (ws: Weighted[]) => (ws.length === 0 ? 0 : weightedQuantile(ws, 0.5));
  const order: Exclude<EstimateLevel, "none">[] = ["trip", "stop", "pattern"];
  const half = config.baseUncertainty[baseKind];

  const index = order.findIndex((l) => levels[l].length > 0);
  if (index === -1) {
    return { level: "none", center: 0, rangeStart: -half, rangeEnd: half, confidence: "estimated", count: 0, recentCount: 0, weightSum: 0, localMedian: 0, aboveMedian: 0 };
  }
  const level = order[index]!;
  const local = weigh(levels[level]);
  const above = index + 1 < order.length ? weigh(levels[order[index + 1]!]) : [];
  const n = local.reduce((s, w) => s + w.weight, 0);
  const localMedian = median(local);
  const aboveMedian = median(above);
  const center = (n * localMedian + config.shrinkK * aboveMedian) / (n + config.shrinkK);

  let rangeStart: number;
  let rangeEnd: number;
  if (local.length < config.percentileFromRecords) {
    rangeStart = Math.min(...local.map((w) => w.value)) - half;
    rangeEnd = Math.max(...local.map((w) => w.value)) + half;
  } else {
    rangeStart = weightedQuantile(local, config.rangeLowQuantile);
    rangeEnd = weightedQuantile(local, config.rangeHighQuantile);
  }

  const count = local.length;
  const recentCount = local.filter((w) => ageDays(w.observedAt, now) <= config.recentWindowDays).length;
  let confidence: Confidence;
  if (count < config.mediumFromRecords) confidence = "low";
  else if (count < config.highFromRecords) confidence = "medium";
  else confidence = recentCount >= config.highFromRecords && rangeEnd - rangeStart <= config.highMaxRangeMinutes + EPS ? "high" : "medium";

  return { level, center, rangeStart, rangeEnd, confidence, count, recentCount, weightSum: n, localMedian, aboveMedian };
}

/**
 * Horário esperado de uma passagem: centro, faixa, confiança, tipo da base e "esteja no ponto às".
 * Sem registros: a base com a sua incerteza (E-02). Com registros: `estimateDeviation` somado à base; para isso
 * `options.target` e `options.now` são obrigatórios.
 */
export function expectedTime(base: BaseTime, records: readonly PassageRecord[], options: ExpectedTimeOptions = {}): ExpectedTime {
  const config = options.config ?? DOMAIN_CONFIG;
  const margin = options.marginMinutes ?? config.marginMinutes;
  let est: Pick<DeviationEstimate, "center" | "rangeStart" | "rangeEnd" | "confidence">;
  if (records.length === 0) {
    const half = config.baseUncertainty[base.kind];
    est = { center: 0, rangeStart: -half, rangeEnd: half, confidence: "estimated" };
  } else {
    if (!options.target || options.now === undefined) throw new Error("expectedTime: com registros, `target` e `now` são obrigatórios");
    est = estimateDeviation(base.kind, records, options.target, options.now, config);
  }
  const rangeStart = base.minute + est.rangeStart;
  return {
    center: base.minute + est.center,
    rangeStart,
    rangeEnd: base.minute + est.rangeEnd,
    confidence: est.confidence,
    baseKind: base.kind,
    beAtStop: rangeStart - margin,
  };
}

// ─── Dentro da viagem em curso (D-070, E-03 §3.5) ───────────────────────────

/**
 * O atraso mais recente que a viagem em curso mostrou hoje (D-070): o desvio do registro aceito (`auto`/`manual`)
 * de `observedAt` mais tardio; `null` se nenhum. Passe só os registros desse `ride` (ou dessa viagem neste dia).
 */
export function latestRideDeviation(records: readonly Pick<PassageRecord, "deviation" | "observedAt" | "matchStatus">[]): number | null {
  let best: { deviation: number; observedAt: number } | null = null;
  for (const r of records) {
    if (r.matchStatus !== "auto" && r.matchStatus !== "manual") continue;
    if (!best || r.observedAt >= best.observedAt) best = r;
  }
  return best ? best.deviation : null;
}

/**
 * Previsão de uma próxima paragem dentro da viagem em curso (D-070): o centro passa a ser `base + rideDeviation`
 * (o atraso de hoje, não o dos outros dias); a faixa do histórico (`historical`, de `expectedTime`) é **deslocada**
 * pela mesma diferença, `shift = (base + rideDeviation) − historical.center`; depois, se algum lado ficar a menos de
 * 2 min do centro, é alargado até ±2 (nunca mais estreita que ±2). Confiança e tipo da base são os do histórico.
 * O `shift` devolvido é o mesmo número para o `shiftMinutes` que a TL-05 aceita (ligação no bloco 2).
 */
export function inRideExpected(
  base: BaseTime,
  historical: ExpectedTime,
  rideDeviation: number,
  options: Pick<ExpectedTimeOptions, "marginMinutes" | "config"> = {},
): { expected: ExpectedTime; shift: number } {
  const config = options.config ?? DOMAIN_CONFIG;
  const margin = options.marginMinutes ?? config.marginMinutes;
  const center = base.minute + rideDeviation;
  const shift = center - historical.center;
  const min = config.inRideMinHalfRangeMinutes;
  const rangeStart = Math.min(historical.rangeStart + shift, center - min);
  const rangeEnd = Math.max(historical.rangeEnd + shift, center + min);
  return {
    expected: { center, rangeStart, rangeEnd, confidence: historical.confidence, baseKind: historical.baseKind, beAtStop: rangeStart - margin },
    shift,
  };
}

// ─── Arredondamento só para mostrar (D-092) ─────────────────────────────────

// Folga contra o erro de ponto flutuante da interpolação (401,99999… tem de mostrar 402).
const EPS = 1e-6;

/** Centro para mostrar: minuto mais próximo, meio minuto sobe (606,5 → 607). */
export function displayCenter(minute: number): number {
  return Math.floor(minute + 0.5 + EPS);
}

/** "Esteja no ponto às" para mostrar: sempre para baixo, nunca mais tarde que o cálculo (600,5 → 600). */
export function displayBeAtStop(minute: number): number {
  return Math.floor(minute + EPS);
}

// ─── Número, origem e destino da passagem (§3.6, D-094) ─────────────────────

export interface PassageInfo {
  position: number;
  stopId: string;
  /** 1ª, 2ª, 3ª… vez deste ponto físico no percurso; `null` se o percurso passa aqui uma vez só. */
  number: number | null;
  /** Ponto de controle anterior (posição), `null` na primeira posição. */
  origin: number | null;
  /** Ponto de controle seguinte (posição), `null` na última posição. */
  destination: number | null;
  /** Primeira e última posição do percurso ("começa aqui" / "termina aqui", textos do bloco 4). */
  isFirst: boolean;
  isLast: boolean;
}

/** Posições ordenadas do percurso. */
function sortedStops(pattern: PatternData): PatternStopData[] {
  return [...pattern.stops].sort((a, b) => a.position - b.position);
}

/**
 * Pontos de controle do percurso: posição marcada (`is_timepoint`) **ou** com horário em alguma viagem dele.
 * O segundo critério cobre a L9, que não tem marca no itinerário mas tem horários na tabela (§3.6).
 */
export function timepointPositions(pattern: PatternData, trips: readonly TripData[]): Set<number> {
  const set = new Set(pattern.stops.filter((s) => s.isTimepoint).map((s) => s.position));
  for (const t of trips) if (t.patternId === pattern.id) for (const st of t.stopTimes) set.add(st.position);
  return set;
}

/** Número, origem e destino da passagem numa posição do percurso. `timepoints` vem de `timepointPositions`. */
export function passageInfo(pattern: PatternData, timepoints: ReadonlySet<number>, position: number): PassageInfo {
  const stops = sortedStops(pattern);
  const here = stops.find((s) => s.position === position);
  if (!here) throw new Error(`percurso ${pattern.id}: posição ${position} não existe`);
  let earlier = 0;
  let total = 0;
  let origin: number | null = null;
  let destination: number | null = null;
  for (const s of stops) {
    if (s.stopId === here.stopId) {
      total++;
      if (s.position < position) earlier++;
    }
    if (timepoints.has(s.position)) {
      if (s.position < position) origin = s.position;
      else if (s.position > position && destination === null) destination = s.position;
    }
  }
  return {
    position,
    stopId: here.stopId,
    number: total > 1 ? earlier + 1 : null,
    origin,
    destination,
    isFirst: position === stops[0]!.position,
    isLast: position === stops[stops.length - 1]!.position,
  };
}

// ─── Passagens num ponto ────────────────────────────────────────────────────

export interface StopPassage {
  tripId: string;
  patternId: string;
  info: PassageInfo;
  base: BaseTime;
  expected: ExpectedTime;
}

/**
 * Todas as passagens das viagens dadas num ponto físico (o que a TL-02 calcula ao abrir o ponto), por ordem de
 * horário. Passe só as viagens que circulam no dia (`tripsRunningOn`); viagens parciais que não chegam à
 * posição ficam de fora. Sem registros nesta etapa.
 */
export function passagesAtStop(
  stopId: string,
  patterns: readonly PatternData[],
  trips: readonly TripData[],
  options: ExpectedTimeOptions = {},
): StopPassage[] {
  const out: StopPassage[] = [];
  for (const pattern of patterns) {
    const positions = pattern.stops.filter((s) => s.stopId === stopId).map((s) => s.position);
    if (positions.length === 0) continue;
    const patternTrips = trips.filter((t) => t.patternId === pattern.id);
    const timepoints = timepointPositions(pattern, patternTrips);
    const infos = positions.map((p) => passageInfo(pattern, timepoints, p));
    for (const trip of patternTrips) {
      for (const info of infos) {
        const base = baseTimeAt(trip, info.position);
        if (base) out.push({ tripId: trip.id, patternId: pattern.id, info, base, expected: expectedTime(base, [], options) });
      }
    }
  }
  return out.sort((a, b) => a.base.minute - b.base.minute);
}

// ─── Daqui para a frente (§4.3) ─────────────────────────────────────────────

export interface AheadStop {
  info: PassageInfo;
  base: BaseTime;
  expected: ExpectedTime;
  isTimepoint: boolean;
  /** "↺ volta aqui": o mesmo ponto físico da posição de onde se olha. */
  returnsHere: boolean;
}

export interface AheadOptions extends ExpectedTimeOptions {
  /**
   * Minutos somados a todos os horários da lista (D-070: previsão dentro da viagem em curso pelo último desvio).
   * Sem uso até a E-03; padrão 0.
   */
  shiftMinutes?: number;
}

export interface AheadResult {
  /** As paragens depois de `position`, até o fim do trecho da viagem, em ordem. */
  stops: AheadStop[];
  /** Os próximos pontos de controle (até 3), para a frase-resumo. */
  nextTimepoints: AheadStop[];
  /** A primeira volta a este ponto físico, ou `null` se a viagem não volta aqui. */
  firstReturn: AheadStop | null;
}

/**
 * Para uma viagem e uma posição: as próximas paragens com horário esperado, número da passagem e "volta aqui".
 * `timepoints` vem de `timepointPositions` (do percurso, como em `passageInfo`).
 */
export function aheadFrom(
  pattern: PatternData,
  timepoints: ReadonlySet<number>,
  trip: TripData,
  position: number,
  options: AheadOptions = {},
): AheadResult {
  if (trip.patternId !== pattern.id) throw new Error(`viagem ${trip.id} não é do percurso ${pattern.id}`);
  const shift = options.shiftMinutes ?? 0;
  const fromStop = pattern.stops.find((s) => s.position === position);
  if (!fromStop) throw new Error(`percurso ${pattern.id}: posição ${position} não existe`);
  const stops: AheadStop[] = [];
  for (const s of sortedStops(pattern)) {
    if (s.position <= position || s.position > trip.lastPosition) continue;
    const raw = baseTimeAt(trip, s.position);
    if (!raw) continue;
    const base = { ...raw, minute: raw.minute + shift };
    stops.push({
      info: passageInfo(pattern, timepoints, s.position),
      base,
      expected: expectedTime(base, [], options),
      isTimepoint: timepoints.has(s.position),
      returnsHere: s.stopId === fromStop.stopId,
    });
  }
  return {
    stops,
    nextTimepoints: stops.filter((s) => s.isTimepoint).slice(0, 3),
    firstReturn: stops.find((s) => s.returnsHere) ?? null,
  };
}

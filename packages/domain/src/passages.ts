/**
 * Passagens (E-02 §3.5, §3.6, §4.3; Fase 1 §4.1; P-04): a que horas cada viagem passa numa paragem, a que horas
 * estar no ponto, o número/origem/destino de cada passagem e a lista "daqui para a frente".
 *
 * Puro: sem banco, sem relógio e sem texto de tela. Quem chama lê o banco e passa os dados já por posição.
 * Minutos são minutos de serviço (D-016) **com decimais**: nada é arredondado dentro do cálculo (T-14);
 * só as funções `displayCenter` e `displayBeAtStop` arredondam, e só para mostrar (D-092).
 */

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

// ─── Horário esperado (§3.5, P-04) ──────────────────────────────────────────

/** Confiança (P-04): `estimated` com 0 registros; `low`/`medium`/`high` chegam com a estatística da E-03. */
export type Confidence = "estimated" | "low" | "medium" | "high";

/**
 * Um registro do Rick nesta passagem. Vazio até a E-03, que acrescenta aqui os campos de que a estatística precisa
 * (desvio, data, "de memória", antes da vigência…). As telas só repassam a lista, por isso não mudam.
 */
export interface PassageRecord {
  /** Minutos depois da base (+) ou antes (−). */
  deviation: number;
}

export interface ExpectedTimeOptions {
  /** Minutos antes do início da faixa para estar no ponto. Padrão 2 (D-019); configurável na E-08. */
  marginMinutes?: number;
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

/** Incerteza da base em minutos, para cada lado (P-04). */
export const BASE_UNCERTAINTY: Record<BaseKind, number> = { official: 2, interpolated: 4, declared: 3 };
/** Margem padrão do "esteja no ponto" (D-019, P-04). */
export const DEFAULT_MARGIN_MINUTES = 2;

/**
 * Horário esperado de uma passagem: centro, faixa, confiança, tipo da base e "esteja no ponto às".
 * Nesta etapa `records` chega sempre vazio e o resultado é só a base com a sua incerteza.
 *
 * Como a E-03 estende (§3.4 da E-03, Fase 1 §4.3, D-120): com registros, o centro passa a ser base + mediana
 * ponderada (encolhida para o nível acima), a faixa é a dos desvios aceitos alargada por `BASE_UNCERTAINTY`, e a
 * confiança sai da contagem. A assinatura fica; a E-03 acrescenta campos a `PassageRecord` e, se precisar do nível
 * acima, um campo opcional em `options`.
 */
export function expectedTime(base: BaseTime, records: readonly PassageRecord[], options: ExpectedTimeOptions = {}): ExpectedTime {
  const margin = options.marginMinutes ?? DEFAULT_MARGIN_MINUTES;
  if (records.length > 0) throw new Error("expectedTime: registros só entram na E-03");
  const half = BASE_UNCERTAINTY[base.kind];
  const rangeStart = base.minute - half;
  return {
    center: base.minute,
    rangeStart,
    rangeEnd: base.minute + half,
    confidence: "estimated",
    baseKind: base.kind,
    beAtStop: rangeStart - margin,
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

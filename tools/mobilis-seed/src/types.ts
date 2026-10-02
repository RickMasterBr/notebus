/**
 * Formatos de entrada (os dois arquivos de mapeamento feitos à mão, E-01 §5.2) e de saída
 * (o arquivo de importação `mobilis-<vigência>.json`, E-01 §5.1).
 *
 * Os dados da MOBILIS não estão neste repositório (D-091): só os tipos e um exemplo inventado
 * (`fixtures/`), que os testes usam.
 */

// ---------- Entrada: timepoints.json ----------

/** Uma linha da tabela de horários e a posição do percurso que ela é. */
export type TimepointRow =
  | { linha_tabela: number; nome_tabela: string; status: "alta"; posicao: number; nome_itinerario: string }
  /** Ambígua: decidido não mapear. Os horários desta linha não entram no arquivo. */
  | { linha_tabela: number; nome_tabela: string; status: "sem_mapear"; nota: string }
  /** Ainda sem resposta: reprova a V4. */
  | { linha_tabela: number; nome_tabela: string; status: "duvida" };

export interface TimepointTable {
  id: string;
  viagens: number;
  linhas: TimepointRow[];
}

export interface TimepointsFile {
  vigencia: string;
  percursos: Record<string, { linha: string; n_posicoes: number; tabelas: TimepointTable[] }>;
}

// ---------- Entrada: stops-map.json ----------

export interface StopsMapFile {
  pontos: {
    /** ID do Google; `null` para um ponto sem ID que junta posições. */
    external_id: string | null;
    nome: string;
    posicoes: { percurso: string; posicao: number }[];
  }[];
}

// ---------- Saída: o arquivo de importação ----------

/** Códigos de tipo de dia (E-01 §4.4). */
export type DayTypeCode = "weekday" | "saturday" | "sunday_holiday";

/** Como a tabela agrupa os dias; entra na chave da viagem. */
export type DaysCode = "util" | "sab" | "dom-fer" | "sab-dom-fer";

/** "Oferta não se realiza em Julho e Agosto" → época que exclui as viagens nesses meses. */
export interface SeasonRef {
  startMd: string;
  endMd: string;
  mode: "exclude";
}

/**
 * Cada entidade oficial leva `key` (o texto fixo da D-086, aprovado no CONFERIR.md parte 4)
 * e `id` = UUIDv5 da chave. Rede, tipos de dia e épocas vão por código, sem chave (Q-48).
 */
export interface SeedFile {
  format: "notebus.mobilis-seed";
  formatVersion: 1;
  network: { name: string; timezone: string };
  dataset: { name: string; version: string };
  stops: { id: string; key: string; name: string; aliases: string[]; externalId: string | null }[];
  lines: { id: string; key: string; code: string; name: string; color: string }[];
  patterns: { id: string; key: string; code: string; lineId: string; label: string; isCircular: boolean }[];
  patternStops: {
    id: string;
    key: string;
    patternId: string;
    position: number;
    stopId: string;
    isTimepoint: boolean;
    timepointLabel: string | null;
  }[];
  timetables: { id: string; key: string; patternId: string; validFrom: string; validTo: null }[];
  trips: {
    id: string;
    key: string;
    timetableId: string;
    firstPosition: number;
    lastPosition: number;
    dayTypes: DayTypeCode[];
    season: SeasonRef | null;
    /** Quadro de origem no markdown, contado pela ordem (1…), não pelo título. */
    sourceTable: number;
  }[];
  stopTimes: { id: string; key: string; tripId: string; patternStopId: string; serviceMinute: number }[];
}

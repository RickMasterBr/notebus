/** Tipos do núcleo do importador do GTFS (C3): o feed já lido e a configuração entram, o SeedFile do formato 2 sai. */
import type { SeedFile, SeedHoliday } from "../types.ts";

export type { SeedFile, SeedHoliday };

/** Espelha o que `lerFeed` (tools/gtfs/lib/gtfs.mjs) devolve, mais `controle` e `nome`. Datas AAAAMMDD. */
export interface GtfsFeed {
  info: { versao: string; inicio: string; fim: string } | null;
  rotas: { id: string; nomeCurto: string }[];
  viagens: { id: string; rota: string; servico: string; direcao: string }[];
  horarios: { viagem: string; parada: string; sequencia: number; hora: string; controle: boolean }[];
  paradas: { id: string; codigo: string; nome: string; lat: number; lon: number }[];
  /** `dias`: 7 flags "0"/"1", de segunda a domingo. */
  calendario: { servico: string; dias: string[]; inicio: string; fim: string }[];
  /** `tipo` "1" acrescenta o serviço na data, "2" remove. */
  excecoes: { servico: string; data: string; tipo: string }[];
}

export interface NetworkConfig {
  network: { name: string; timezone: string };
  datasetName: string;
  lines: { number: string; name: string; color: string }[];
  /** `code` como "L3-s2"; `line` é o `number` da linha. */
  patterns: { routeId: string; code: string; line: string; label: string; isCircular: boolean }[];
  /** Tabela de equivalência de pontos (D-086): `stopId` do feed → chave e nome do ponto do app. */
  stops: { stopId: string; key: string; name: string; aliases: string[]; externalId: string | null }[];
  /** Feriados municipais já prontos (id e chave). */
  holidays: SeedHoliday[];
}

/** Dado simples, não texto de relatório (o relatório é do C3b). */
export interface Warning {
  code: string;
  message: string;
  items: string[];
}

export type GenError = Warning;

export type GenerateResult =
  | { ok: true; seed: SeedFile; warnings: Warning[] }
  | { ok: false; errors: GenError[]; warnings: Warning[] };

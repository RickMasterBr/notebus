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

// O formato mora no domínio: o app importa o mesmo arquivo que esta ferramenta gera (E-01 bloco 4a).
export type { DayTypeCode, DaysCode, SeasonRef, SeedFile } from "@notebus/domain/src/seedFormat.ts";

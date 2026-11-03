/** Tipos de `lerFeed` (gtfs.mjs) para o TypeScript do importador. Datas AAAAMMDD. */
export interface FeedLido {
  pasta: string;
  info: { versao: string; inicio: string; fim: string } | null;
  rotas: { id: string; nomeCurto: string }[];
  viagens: { id: string; rota: string; servico: string; direcao: string }[];
  horarios: { viagem: string; parada: string; sequencia: number; hora: string; controle: boolean }[];
  paradas: { id: string; codigo: string; nome: string; lat: number; lon: number }[];
  calendario: { servico: string; dias: string[]; inicio: string; fim: string }[];
  excecoes: { servico: string; data: string; tipo: string }[];
}

export function lerFeed(pasta: string): FeedLido;

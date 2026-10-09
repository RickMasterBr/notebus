/**
 * Configuração única do domínio (E-03 §3.4): todos os números das regras de casamento e do horário esperado, com os
 * valores da P-04 ("Parâmetros") e da D-120. Calibrar = trocar um valor aqui; nenhuma função tem número solto.
 * As funções recebem `config` opcional (padrão `DOMAIN_CONFIG`), para os testes e a E-08 poderem variar.
 */
export interface DomainConfig {
  /** Casamento (Fase 1 §4.2): desvio aceito de −`matchEarlyMinutes` a +`matchLateMinutes`, inclusive. */
  matchEarlyMinutes: number;
  matchLateMinutes: number;
  /** Lacuna para agrupar registros sem horário de referência (P-04 §2). Ainda sem uso: entra com as regras do usuário. */
  noReferenceGapMinutes: number;
  /** Encolhimento `k` (P-04 §3.2). */
  shrinkK: number;
  /** Meia-vida da recência, em dias (P-04 §3.3). */
  halfLifeDays: number;
  /** Peso de um registro anterior à vigência atual (P-04 §3.3). */
  beforeValidityWeight: number;
  /** Peso de um registro "de memória" (`mode = memory`, P-04 §3.3). */
  memoryWeight: number;
  /** Incerteza da base para cada lado, em minutos (P-04 §3.4). */
  baseUncertainty: { official: number; interpolated: number; declared: number };
  /** Margem do "esteja no ponto às" (D-019, P-04 §4). */
  marginMinutes: number;
  /** A partir de quantos registros a faixa usa os percentis (P-04 §3.4). */
  percentileFromRecords: number;
  /** Percentis da faixa com muitos registros (P-04 §3.4: 10 a 90). */
  rangeLowQuantile: number;
  rangeHighQuantile: number;
  /** Confiança (P-04 §3.5): `medium` a partir de N registros, `high` possível a partir de N registros. */
  mediumFromRecords: number;
  highFromRecords: number;
  /** "Recentes" para a confiança alta, em dias (D-120). */
  recentWindowDays: number;
  /** Faixa máxima, em minutos, para a confiança alta (P-04 §3.5). */
  highMaxRangeMinutes: number;
  /** Dentro da viagem (D-070): a faixa deslocada nunca fica mais estreita que ± isto. */
  inRideMinHalfRangeMinutes: number;
  /** O `ride` aberto fecha sozinho quando passa o fim do percurso + isto (E-03 §4, Q-82 e D-030: +30). */
  rideEndToleranceMinutes: number;
  /** `ride` sem viagem conhecida (sem fim de percurso) fecha sozinho isto depois do embarque (Q-85: 3 h). */
  rideWithoutTripHours: number;
  /** Edição (E-04 §3.1): "mais ou menos" em minutos para cada lado do centro (máximo 20 min no total, invariante 4). */
  intervalHalfMinutes: readonly number[];
  /** O seletor de hora vale para a ocorrência mais recente no passado, até estas horas atrás (Q-44, T-42). */
  pickedTimeLookbackHours: number;
  /** TL-09: só entram como vizinhas da órfã as passagens com desvio absoluto até isto (proposta do bloco 1 da E-04). */
  verifyMaxDeviationMinutes: number;
  /** TL-09 "Ou foi outra linha?": uma passagem a até isto da hora anotada (E-04 §4.3). */
  verifyOtherLineWindowMinutes: number;
  /** "Ir para X" (E-05 §3.3, D-034): a pé fica acima de um ônibus que ela vence por pelo menos isto (inclusive). */
  walkBeatsBusMinutes: number;
  /** "Ir para X" (E-05 §3.1, D-100): viagens viáveis por opção de ônibus e cartões no máximo na folha. */
  tripsPerOption: number;
  maxCards: number;
  /** Aviso de saída (E-06 §3.2): janela de avisos agendados (o iOS guarda 64), horizonte em dias e o "Adiar" em minutos. */
  alarmWindowSize: number;
  alarmHorizonDays: number;
  alarmSnoozeMinutes: number;
  /** Localização (E-07 §3.4): o ponto sugerido exige precisão até `suggestMaxAccuracyM` e posição de até `suggestMaxAgeMs`. */
  suggestMaxAccuracyM: number;
  suggestMaxAgeMs: number;
  /** "Perto": raio em metros até o ponto ou o lugar. */
  nearRadiusM: number;
  /** Pontos frente a frente: a menos disto um do outro, vale a rotina. */
  facingStopsM: number;
  /** Guardar a localização do ponto (T-69): precisão máxima de cada registro, distância máxima à mediana e mínimo de registros. */
  guardMaxAccuracyM: number;
  guardMaxFromMedianM: number;
  guardMinRecords: number;
  /** Marcar à mão "usar minha localização agora" (T-70): precisão máxima. */
  manualMaxAccuracyM: number;
  /** Mais longe que isto do centro de Leiria o app pergunta antes de guardar (T-70). */
  farFromLeiriaM: number;
  /** Centro aproximado de Leiria (a conferir pela coordenação). */
  leiriaCenter: { lat: number; lon: number };
  /** Onde o mapa abre (D-096): o GPS só vale se for preciso até isto (m) e recente até isto (ms). */
  mapOpenMaxAccuracyM: number;
  mapOpenMaxAgeMs: number;
  /** Onde o mapa abre (D-110): GPS mais longe que isto do centro de Leiria não abre o mapa. */
  mapOpenMaxFromLeiriaM: number;
  /** Região offline padrão (plano §3.6); a conferir contra o ponto final das 9 linhas. */
  offlineBox: { south: number; west: number; north: number; east: number };
  /** Zoom dos tiles baixados (D-179): o OpenFreeMap só tem tiles até o 14; o mapa amplia até o 16 sem tile novo. */
  offlineMinZoom: number;
  offlineMaxTileZoom: number;
  /** Margem em metros ao redor de um ponto que cresce a região. */
  offlineMarginM: number;
  /** Ponto ou lugar mais longe que isto (m) do centro de Leiria não cresce a região (decisão da coordenação). */
  offlineMaxPointFromLeiriaM: number;
  /** Tamanho médio de um tile em KB (9,1 MB / 180 tiles, S-03): só estimativa para o texto do cartão. */
  offlineAvgTileKb: number;
}

export const DOMAIN_CONFIG: Readonly<DomainConfig> = Object.freeze({
  matchEarlyMinutes: 5,
  matchLateMinutes: 15,
  noReferenceGapMinutes: 5,
  shrinkK: 3,
  halfLifeDays: 28,
  beforeValidityWeight: 0.25,
  memoryWeight: 0.5,
  baseUncertainty: Object.freeze({ official: 2, interpolated: 4, declared: 3 }),
  marginMinutes: 2,
  percentileFromRecords: 5,
  rangeLowQuantile: 0.1,
  rangeHighQuantile: 0.9,
  mediumFromRecords: 3,
  highFromRecords: 6,
  recentWindowDays: 56,
  highMaxRangeMinutes: 4,
  inRideMinHalfRangeMinutes: 2,
  rideEndToleranceMinutes: 30,
  rideWithoutTripHours: 3,
  intervalHalfMinutes: Object.freeze([2, 5, 10]),
  pickedTimeLookbackHours: 24,
  verifyMaxDeviationMinutes: 30,
  verifyOtherLineWindowMinutes: 15,
  walkBeatsBusMinutes: 15,
  tripsPerOption: 2,
  maxCards: 6,
  alarmWindowSize: 50,
  alarmHorizonDays: 14,
  alarmSnoozeMinutes: 5,
  suggestMaxAccuracyM: 100,
  suggestMaxAgeMs: 120_000,
  nearRadiusM: 150,
  facingStopsM: 25,
  guardMaxAccuracyM: 30,
  guardMaxFromMedianM: 40,
  guardMinRecords: 3,
  manualMaxAccuracyM: 50,
  farFromLeiriaM: 50_000,
  leiriaCenter: Object.freeze({ lat: 39.7437, lon: -8.8071 }),
  mapOpenMaxAccuracyM: 100,
  mapOpenMaxAgeMs: 600_000,
  mapOpenMaxFromLeiriaM: 30_000,
  offlineBox: Object.freeze({ south: 39.66, west: -8.93, north: 39.82, east: -8.69 }),
  offlineMinZoom: 10,
  offlineMaxTileZoom: 14,
  offlineMarginM: 2_000,
  offlineMaxPointFromLeiriaM: 30_000,
  offlineAvgTileKb: 51,
});

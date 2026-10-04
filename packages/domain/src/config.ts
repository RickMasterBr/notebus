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
});

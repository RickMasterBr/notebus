/**
 * Peças numéricas do horário esperado (E-03 §3.4, P-04 §3, D-120): peso de um registro e quantil ponderado.
 * Puro: o "agora" e a vigência chegam como argumento.
 */
import { DOMAIN_CONFIG, type DomainConfig } from "./config.ts";

const DAY_MS = 86_400_000;

/** O que o peso de um registro precisa saber. */
export interface WeightInput {
  /** Instante observado (epoch ms UTC). */
  observedAt: number;
  /** Dia de serviço do registro (`AAAA-MM-DD`). */
  serviceDate: string;
  mode: "live" | "later" | "memory";
}

/** Idade do registro em dias (com decimais; nunca negativa). */
export function ageDays(observedAt: number, now: number): number {
  return Math.max(0, (now - observedAt) / DAY_MS);
}

/**
 * Peso (P-04 §3.3): recência com meia-vida de 28 dias × 0,25 se o dia de serviço é anterior à vigência atual
 * (`validFrom`) × 0,5 se "de memória". Os fatores multiplicam (T-97).
 */
export function recordWeight(record: WeightInput, now: number, validFrom: string | null, config: DomainConfig = DOMAIN_CONFIG): number {
  let w = 0.5 ** (ageDays(record.observedAt, now) / config.halfLifeDays);
  if (validFrom !== null && record.serviceDate < validFrom) w *= config.beforeValidityWeight;
  if (record.mode === "memory") w *= config.memoryWeight;
  return w;
}

/**
 * Quantil ponderado `q` (0 a 1) dos valores, pela **soma acumulada dos pesos com interpolação linear**:
 * ordena os valores; cada um ocupa um bloco do tamanho do seu peso e fica no **meio do seu bloco**,
 * na posição `(peso acumulado antes + peso / 2) / peso total`; o quantil `q` é a interpolação linear entre os dois
 * valores cujas posições cercam `q`. Antes da primeira posição vale o menor valor; depois da última, o maior.
 *
 * Com pesos iguais é o percentil "de Hazen" (posição do i-ésimo de n = (i − 0,5) / n), e `q = 0,5` dá a mediana de
 * sempre (número par de valores: a média dos dois do meio). A P-04 não fixou o método; este é a proposta da E-03.
 */
export function weightedQuantile(items: readonly { value: number; weight: number }[], q: number): number {
  const sorted = items.filter((i) => i.weight > 0).sort((a, b) => a.value - b.value);
  if (sorted.length === 0) throw new Error("weightedQuantile: nenhum valor com peso");
  const total = sorted.reduce((s, i) => s + i.weight, 0);
  let before = 0;
  const points = sorted.map((i) => {
    const p = (before + i.weight / 2) / total;
    before += i.weight;
    return { p, value: i.value };
  });
  if (q <= points[0]!.p) return points[0]!.value;
  for (let j = 1; j < points.length; j++) {
    const a = points[j - 1]!;
    const b = points[j]!;
    if (q <= b.p) return a.value + (b.value - a.value) * ((q - a.p) / (b.p - a.p));
  }
  return points[points.length - 1]!.value;
}

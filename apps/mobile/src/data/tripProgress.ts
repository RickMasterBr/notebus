/**
 * Barra de progresso da Tela de viagem (D-392): uma fração de 0 a 1 entre o embarque e a descida escolhida
 * (ou o fim do percurso, sem descida escolhida), pela última paragem cuja hora esperada já passou.
 * Puro: sem relógio (o minuto de agora vem de quem chama), sem banco e sem texto.
 */
import type { AlightRow } from "./rideView";

/**
 * Fração do percurso já feita. `rows` chegam na ordem do percurso e `boardPosition` é a posição do embarque.
 * `null` sem linhas, sem minuto de agora ou quando o alvo é o próprio embarque (não há percurso a dividir).
 */
export function tripProgress(
  rows: readonly AlightRow[],
  boardPosition: number,
  targetPosition: number | null,
  nowMinute: number | null,
): number | null {
  if (rows.length === 0 || nowMinute === null) return null;
  const target = targetPosition ?? rows[rows.length - 1]!.position;
  if (target === boardPosition) return null;

  // A paragem atual é a mais adiante cuja hora esperada já passou; antes da primeira, ainda se está no embarque.
  let latest: number | null = null;
  for (const row of rows) {
    if (row.minute <= nowMinute && (latest === null || row.position > latest)) latest = row.position;
  }
  const current = latest ?? boardPosition;

  const fraction = (current - boardPosition) / (target - boardPosition);
  return Math.min(1, Math.max(0, fraction));
}

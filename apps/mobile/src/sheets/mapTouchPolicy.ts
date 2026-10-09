import type { Detent } from "./stack";

export interface MapTouchPolicy {
  /**
   * Se o fundo transparente atrás da gaveta captura toques/gestos.
   * - Pequeno: false (fundo some; mapa recebe tudo).
   * - Médio: false (fundo não captura; mapa recebe arrastar/zoom/giro, D-180).
   * - Grande: true (fundo captura e recolhe; mapa não recebe arrasto).
   */
  backdropCaptures: boolean;
  /**
   * Se um toque simples no mapa (quando a gaveta está aberta) recolhe a gaveta ao detent pequeno.
   * - Pequeno: false (já está pequeno).
   * - Médio: true (toque simples no mapa ou num ponto recolhe ao pequeno, D-180).
   * - Grande: false (o próprio fundo captura antes).
   */
  mapTapCollapses: boolean;
  /**
   * Se o toque num ponto do mapa abre a folha do ponto.
   * - Pequeno: true (abre a folha do ponto).
   * - Médio: false (só recolhe a gaveta; não abre o ponto, D-180).
   * - Grande: false (o fundo captura antes).
   */
  pointTapOpensSheet: boolean;
}

/**
 * Regra de toque e gestos do mapa em cada detent da folha do Início (D-145, D-180).
 */
export function mapTouchPolicy(detent: Detent): MapTouchPolicy {
  switch (detent) {
    case 0:
      return {
        backdropCaptures: false,
        mapTapCollapses: false,
        pointTapOpensSheet: true,
      };
    case 1:
      return {
        backdropCaptures: false,
        mapTapCollapses: true,
        pointTapOpensSheet: false,
      };
    case 2:
      return {
        backdropCaptures: true,
        mapTapCollapses: false,
        pointTapOpensSheet: false,
      };
  }
}

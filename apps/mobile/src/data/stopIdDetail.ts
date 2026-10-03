/** Valor secundário da linha de um ponto na Busca (4.4 §5.12): o ID do ponto na MOBILIS, quando existe. É dado, não frase. */
export function stopIdDetail(externalId: string | null | undefined): string | undefined {
  const id = externalId?.trim();
  return id ? id : undefined;
}

/** Uma linha só sob o título da lista: o ID e o apelido juntos (E-08 bloco 6, E4). */
export function subline(detail: string | undefined, extra: string | undefined): string | null {
  if (detail && extra) return `${detail} · ${extra}`;
  return detail || extra || null;
}

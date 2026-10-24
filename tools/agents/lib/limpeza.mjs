// Puro: sem fs nem processo. Decide o que sai; quem le o git e quem apaga fica no limpar.mjs.
// `worktrees` = ramos em uso por worktrees que nao saem nesta limpeza (principal, travada, a do --repo).
export const decidir = ({ branches, mescladas, atual, destino, protegidas, worktrees = [], tags = [], remotas = [], remotasMescladas = [] }) => {
  const mescl = new Set(mescladas);
  const prot = new Set(protegidas);
  const tg = new Set(tags);
  const wt = new Set(worktrees);
  const motivo = (n) => {
    if (n === destino) return 'DESTINO';
    if (n === atual) return 'ATUAL';
    if (prot.has(n)) return 'PROTEGIDA';
    if (tg.has(n)) return 'TAG_HOMONIMA';
    if (wt.has(n)) return 'EM_USO_POR_WORKTREE';
    return mescl.has(n) ? null : 'NAO_MESCLADA';
  };
  const remover = [];
  const manter = [];
  for (const nome of branches) {
    const m = motivo(nome);
    if (m) manter.push({ nome, motivo: m });
    else remover.push(nome);
  }
  const mesclRemotas = new Set(remotasMescladas);
  const remover_remotas = remotas.filter((n) => mesclRemotas.has(n) && !prot.has(n) && !tg.has(n) && n !== destino && n !== atual);
  return { remover, manter, remover_remotas };
};

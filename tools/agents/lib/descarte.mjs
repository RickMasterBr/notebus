// Puro: sem fs nem processo. Decide a recusa e monta a lista; quem le o git e quem apaga fica no descartar.mjs.

// .agent/ e a junção de node_modules sao do fluxo, nao trabalho do worker
// os dois arquivos que o dispatch grava na raiz da pista (lib/despacho.mjs); so estes caminhos exatos
export const controleDoDispatch = ['opencode.json', '.agents/hooks.json'];

export const ehControle = (arquivo) => {
  const a = arquivo.replace(/\\/g, '/');
  return /^(\.agent|node_modules)(\/|$)/.test(a) || /(^|\/)node_modules$/.test(arquivo) || controleDoDispatch.includes(a);
};

export const sujeira = (arquivos) => arquivos.filter((a) => !ehControle(a));

// pista: { nome, principal }; protegidas: nomes que nunca saem
export const classificar = ({ pista, protegidas = [], arquivos = [], emUso = false }) => {
  if (pista.principal || protegidas.includes(pista.nome)) return 'PISTA_PROTEGIDA';
  if (emUso) return 'PISTA_EM_USO';
  if (sujeira(arquivos).length) return 'PISTA_SUJA';
  return 'ok';
};

// nomes pedidos, sem repetir, na ordem dada
export const ordemDeRemocao = (pedidos) => [...new Set(pedidos.map((s) => s.trim()).filter(Boolean))];

// base, base-2, base-3... o primeiro que `existe` nao acha
export const nomeLivre = (base, existe) => {
  let n = base;
  for (let i = 2; existe(n); i++) n = `${base}-${i}`;
  return n;
};

const sn = (v) => (v ? 'sim' : 'nao');

export const formatarLista = (pistas, bytes, raiz) =>
  [
    ...pistas.map((p) =>
      [
        `${p.nome}`,
        `  branch: ${p.branch ?? '(solta)'}`,
        `  ultimo commit: ${p.hash} ${p.data}`,
        `  com .agent: ${sn(p.comAgent)}`,
        `  suja: ${sn(sujeira(p.arquivos).length)}${sujeira(p.arquivos).length ? ` (${sujeira(p.arquivos).join(', ')})` : ''}`,
        `  em uso: ${sn(p.emUso)}`,
        `  mesclada: ${sn(p.mesclada)}`,
      ].join('\n'),
    ),
    `Para remover: descartar --raiz ${raiz} --aplicar <nome>`,
    `Bytes que liberaria (todas): ${bytes}`,
  ].join('\n');

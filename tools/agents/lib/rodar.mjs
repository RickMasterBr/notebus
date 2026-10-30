import path from 'node:path';

export class RodarErro extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
  }
}

const GASTO = {
  claude: 'gasta o limite de 5 h do Claude',
  agy: 'gasta o limite do Antigravity',
  opencode: 'gratis (limite invisivel do provedor)',
};

export const parseId = (id) => {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new RodarErro('ID_INVALIDO', `id invalido: ${id}`);
  return id;
};

export const caminhosPadrao = ({ raiz }) => {
  const docs = path.join(raiz, 'notebus-docs', 'docs');
  return {
    docs,
    schemas: path.join(docs, 'v1', 'infra', 'modelos'),
    contrato: (id) => path.join(docs, 'v1', 'contratos', `${id}.md`),
    gateVigente: path.join(raiz, '_gate-bin', 'VIGENTE.txt'),
  };
};

export const lerCommitVigente = (texto) => {
  const c = String(texto).trim();
  if (!/^[0-9a-f]{7,40}$/i.test(c)) throw new RodarErro('GATE_VIGENTE_INVALIDO', `VIGENTE.txt nao tem um commit: ${c.slice(0, 40)}`);
  return c;
};

export const caminhoGate = (raiz, commit) => path.join(raiz, '_gate-bin', commit, 'tools', 'agents', 'gate.mjs');

export const resumoAntes = (cab, { gateCommit }) => {
  const { harness, modelo } = cab.executor;
  const linhas = [
    ['Tarefa:', cab.id],
    ['Agente:', `${harness} (${modelo})  -> ${GASTO[harness] ?? 'gasto desconhecido'}`],
    ['Limites:', `${cab.limites.turnos} turnos, ${cab.limites.minutos} minutos`],
    ['Arquivos:', `${cab.arquivos_permitidos.length} permitidos, ${(cab.areas_autorizadas ?? []).length} areas protegidas autorizadas`],
    ['Gate:', `copia confiavel ${gateCommit}`],
  ];
  return [...linhas.map(([k, v]) => `${k.padEnd(14)}${v}`), 'ENTER para despachar, Ctrl+C para cancelar'].join('\n');
};

export const veredito = (codigo, temGate) => {
  if (codigo === 0) return 'APROVADO';
  if (codigo === 3) return 'INCONCLUSIVO';
  if (codigo === 2) return 'USO ERRADO';
  return codigo === 1 && temGate ? 'REPROVADO' : 'FALHOU';
};

const tem = (v) => v !== undefined && v !== null && !(typeof v === 'number' && Number.isNaN(v));

export const resumoFinal = (meta, gateJson, codigo, { relatorio, meta: caminhoMeta } = {}) => {
  const linhas = [`Veredito: ${veredito(codigo, tem(gateJson))}`];
  if (!tem(meta)) linhas.push('Sem meta.json');
  else {
    const m = meta.meta ?? {};
    const tk = m.tokens;
    // numero puro (forma antiga) ou { total, fonte }; outra coisa some
    const tokens = typeof tk === 'number' ? tk : tem(tk?.total) ? `${tk.total}${tem(tk.fonte) ? ` (${tk.fonte})` : ''}` : null;
    const itens = [['Duracao', tem(meta.duracao_s) ? `${meta.duracao_s} s` : null], ['Turnos', m.turnos], ['Custo (USD)', m.custo_usd], ['Tokens', tokens]];
    for (const [k, v] of itens) if (tem(v)) linhas.push(`${k}: ${v}`);
  }
  if (tem(relatorio)) linhas.push(`Relatorio: ${relatorio}`);
  if (tem(caminhoMeta)) linhas.push(`Meta: ${caminhoMeta}`);
  linhas.push('Proximo passo: avise a coordenacao que terminou');
  return linhas.join('\n');
};

export const LEIA_ME = `# Arquivo dos JSON de despacho

NAO LER. Estes arquivos (relatorio, meta, gate, autorizacao) ficam guardados so para o caso de um desastre. O resumo legivel de cada tarefa esta em ../<id>.md e no CSV v1/infra/registro-execucao.csv. Agentes e coordenacao nao devem abrir esta pasta como rotina.
`;

export const ARQUIVOS_GUARDADOS = ['relatorio.json', 'relatorio.original.json', 'meta.json', 'gate.json', 'autorizacao.json'];

export const caminhosRegistro = ({ docs, csv, registros }) => {
  const reg = registros ? path.resolve(registros) : path.join(docs, 'v1', 'registros');
  return { csv: csv ? path.resolve(csv) : path.join(docs, 'v1', 'infra', 'registro-execucao.csv'), registros: reg, arquivo: path.join(reg, 'arquivo') };
};

// vazio = null (pula); invalido = undefined; valido = inteiro 0..100 (o trace anotar so grava inteiro, entao 12,5 vira 13)
export const lerPct = (texto) => {
  const t = String(texto ?? '').trim();
  if (t === '') return null;
  if (!/^\d+([.,]\d+)?$/.test(t)) return undefined;
  const n = Number(t.replace(',', '.'));
  return n <= 100 ? Math.round(n) : undefined;
};

// nunca devolve uma pasta que ja existe: <id>, <id>--2, <id>--3...
export const pastaLivre = (arquivo, id, existe) => {
  for (let n = 1; ; n++) {
    const p = path.join(arquivo, n === 1 ? id : `${id}--${n}`);
    if (!existe(p)) return p;
  }
};

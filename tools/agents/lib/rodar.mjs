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
    const itens = [['Duracao', tem(meta.duracao_s) ? `${meta.duracao_s} s` : null], ['Turnos', m.turnos], ['Custo (USD)', m.custo_usd], ['Tokens', m.tokens]];
    for (const [k, v] of itens) if (tem(v)) linhas.push(`${k}: ${v}`);
  }
  if (tem(relatorio)) linhas.push(`Relatorio: ${relatorio}`);
  if (tem(caminhoMeta)) linhas.push(`Meta: ${caminhoMeta}`);
  linhas.push('Proximo passo: avise a coordenacao que terminou');
  return linhas.join('\n');
};

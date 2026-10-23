import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { CONTROLE } from '../../hooks/protected-paths.mjs';
import { parseZ } from '../git.mjs';
import { validar } from '../schema.mjs';
import { retrato } from '../retrato.mjs';

const item = (status, codigo, mensagem, evidencia = [], extra = {}) => ({ status, codigo, mensagem, evidencia, ...extra });
const falha = (codigo, mensagem, evidencia) => item('falha', codigo, mensagem, evidencia);
const aviso = (codigo, mensagem, evidencia, extra) => item('aviso', codigo, mensagem, evidencia, extra);

const norm = (p) => p.replace(/\\/g, '/');
const baixo = (p) => norm(p).toLowerCase();
const semBarra = (s) => s.replace(/\/+$/, '');
// sem diferenciar maiusculas: areas protegidas e controle (falha fechada)
const sob = (p, entrada) => {
  const r = baixo(p);
  const e = semBarra(baixo(entrada));
  return r === e || r.startsWith(e + '/');
};
// diferenciando maiusculas: a lista do contrato
const naLista = (lista, p) => lista.some((e) => (e.endsWith('/') ? p.startsWith(e) : p === e || p.startsWith(e + '/')));
const nominal = (lista, p) => lista.includes(p);
const extensao = (p) => path.posix.extname(p).toLowerCase();
const nomeBase = (p) => path.posix.basename(p);
const sha = (d) => createHash('sha256').update(d).digest('hex');

// excecoes_gate: G06 aceita arquivo exato ou pasta terminada em "/"; G07, G08 e G14 so arquivo exato
const excecao = (ctx, v, p) =>
  (ctx.contrato.excecoes_gate ?? []).find((e) => {
    const c = norm(e.caminho);
    return e.verificacao === v && (v === 'G06' && c.endsWith('/') ? p.startsWith(c) : p === c);
  });

const agrupa = (mapa, codigo, mensagem, p) => {
  if (!mapa.has(codigo)) mapa.set(codigo, { mensagem, evidencia: [] });
  mapa.get(codigo).evidencia.push(p);
};
const emite = (mapa) => [...mapa].map(([codigo, { mensagem, evidencia }]) => falha(codigo, mensagem, evidencia));

export const g00 = (ctx) => {
  const rel = path.relative(realpathSync.native(ctx.pista), ctx.gateDir);
  return !rel.startsWith('..') && !path.isAbsolute(rel) ? [falha('GATE_DENTRO_DA_PISTA', `o gate roda de dentro da pista: ${ctx.gatePath}`)] : [];
};

export const g01 = (ctx) => {
  const out = [];
  if (ctx.contratoErros) out.push(falha('CONTRATO_INVALIDO', 'contrato fora do schema', ctx.contratoErros));
  const copia = path.join(ctx.pista, '.agent', 'contrato.md');
  if (!existsSync(copia)) {
    out.push(ctx.modo === 'manual' ? aviso('SEM_COPIA_DO_CONTRATO', 'sem .agent/contrato.md na pista') : falha('CONTRATO_ALTERADO', 'a copia do contrato sumiu da pista'));
  } else if (sha(readFileSync(copia)) !== ctx.contratoSha) {
    out.push(falha('CONTRATO_ALTERADO', 'o contrato da pista difere do contrato conferido'));
  }
  return out;
};

export const g02 = (ctx) => {
  const r = ctx.relatorio();
  if (r.erro) return [falha('RELATORIO_INVALIDO', 'relatorio ilegivel', [r.erro])];
  const out = [];
  const v = validar(ctx.schemaRelatorio, r.dados);
  if (!v.ok) out.push(falha('RELATORIO_INVALIDO', 'relatorio fora do schema', v.erros.map((e) => `${e.caminho || '/'} ${e.codigo} ${e.mensagem}`)));
  const d = r.dados;
  if (d && typeof d === 'object') {
    if (typeof d.tarefa === 'string' && d.tarefa !== ctx.id) out.push(falha('RELATORIO_DE_OUTRA_TAREFA', `tarefa ${d.tarefa} != ${ctx.id}`));
    else if (typeof d.branch === 'string' && d.branch !== ctx.branch) out.push(falha('RELATORIO_DE_OUTRA_TAREFA', `branch ${d.branch} != ${ctx.branch}`));
    if (typeof d.commit === 'string' && (d.commit.length < 7 || !ctx.head.startsWith(d.commit))) out.push(falha('RELATORIO_DE_OUTRO_COMMIT', `commit ${d.commit} nao e prefixo de ${ctx.head}`));
  }
  return out;
};

export const g15 = (ctx) => {
  const out = [];
  const gitDir = path.resolve(ctx.pista, ctx.linha(['rev-parse', '--absolute-git-dir']));
  if (existsSync(path.join(gitDir, 'config.worktree'))) out.push(falha('GIT_CONFIG_ALTERADO', 'config.worktree na pista'));
  const antes = ctx.meta?.retrato;
  if (!antes) return [...out, aviso('SEM_RETRATO', 'sem retrato do ambiente (modo manual)')];
  const agora = retrato({ repo: ctx.repo });
  for (const [campo, codigo] of [['repo_head', 'ESCRITA_FORA_DA_PISTA'], ['repo_status_sha256', 'ESCRITA_FORA_DA_PISTA'], ['exclude_sha256', 'GIT_CONFIG_ALTERADO'], ['config_sha256', 'GIT_CONFIG_ALTERADO']]) {
    if (agora[campo] !== antes[campo]) out.push(falha(codigo, `${campo} mudou no repositorio principal`, [campo]));
  }
  return out;
};

// arquivos de codigo dentro de uma pasta ignorada (o git so mostra o nome da pasta); nao entra em links
const codigoEm = (dir, exts, achados = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) codigoEm(f, exts, achados);
    else if (exts.includes(extensao(e.name))) achados.push(f);
    if (achados.length >= 20) break;
  }
  return achados;
};

const ignoradoPermitido = (lista, p) => {
  const partes = semBarra(p).split('/');
  const dir = p.endsWith('/') ? partes : partes.slice(0, -1);
  return lista.some((e) => {
    if (e.endsWith('/')) return partes[0] + '/' === e || dir.includes(semBarra(e));
    if (e.startsWith('*')) return nomeBase(semBarra(p)).endsWith(e.slice(1));
    return nomeBase(semBarra(p)) === e;
  });
};

export const g03 = (ctx) => {
  const juncoes = new Set(ctx.junctions);
  const nao = [];
  const sujo = [];
  const suspeito = [];
  const outros = [];
  const partes = parseZ(ctx.git(['status', '--porcelain=v1', '-z', '--ignored=matching', '--untracked-files=all']));
  for (let i = 0; i < partes.length; i++) {
    const xy = partes[i].slice(0, 2);
    const p = partes[i].slice(3);
    if (/[RC]/.test(xy)) i++; // o token seguinte e o nome de origem
    if (juncoes.has(semBarra(p))) continue;
    if (xy === '??') {
      if (!p.startsWith('.agent/')) nao.push(p);
    } else if (xy === '!!') {
      if (ignoradoPermitido(ctx.config.ignorados_permitidos, p)) continue;
      if (p.endsWith('/')) {
        const codigo = codigoEm(path.join(ctx.pista, p), ctx.config.extensoes_codigo);
        (codigo.length ? suspeito : outros).push(...(codigo.length ? codigo.map((c) => norm(path.relative(ctx.pista, c))) : [p]));
      } else (ctx.config.extensoes_codigo.includes(extensao(p)) ? suspeito : outros).push(p);
    } else sujo.push(p);
  }
  const escondidos = parseZ(ctx.git(['ls-files', '-v', '-z'])).filter((l) => /[a-zS]/.test(l[0])).map((l) => l.slice(2));
  const out = [];
  if (sujo.length) out.push(falha('NAO_COMMITADO', 'modificado ou apagado sem commit', sujo));
  if (nao.length) out.push(falha('NAO_RASTREADO', 'arquivo novo fora de .agent/ e sem commit', nao));
  if (escondidos.length) out.push(falha('GIT_ESCONDENDO', 'assume-unchanged ou skip-worktree', escondidos));
  if (suspeito.length) out.push(falha('IGNORADO_SUSPEITO', 'codigo ignorado fora das excecoes', suspeito));
  if (outros.length) out.push(aviso('IGNORADO', 'ignorado de outro tipo fora das excecoes', outros));
  return out;
};

export const g04 = (ctx) => {
  const c = ctx.contrato;
  const out = [];
  if (!ctx.tenta(['merge-base', '--is-ancestor', ctx.base, ctx.head]).ok) out.push(falha('BASE_PERDIDA', `${ctx.base} nao esta no historico do HEAD`));
  const merges = ctx.linha(['rev-list', '--merges', `${ctx.base}..${ctx.head}`]).split(/\s+/).filter(Boolean);
  if (merges.length) out.push(falha('MERGE_NA_TAREFA', 'commit de merge na branch', merges));
  if (ctx.linha(['rev-list', '--count', `${ctx.base}..${ctx.head}`]) === '0') out.push(falha('SEM_COMMIT', 'nenhum commit depois da base'));
  const codigos = new Map();
  for (const m of ctx.mudados()) {
    const p = m.caminho;
    if (m.modo === '120000' || m.modo === '160000') agrupa(codigos, 'SYMLINK_OU_SUBMODULO', 'symlink ou submodulo', p);
    if (naLista(c.arquivos_permitidos, p)) continue;
    ctx.achados.fora_da_lista.push(p);
    if (naLista(c.arquivos_de_outro_worker ?? [], p)) agrupa(codigos, 'OUTRO_WORKER', 'arquivo de outro worker', p);
    else agrupa(codigos, 'FORA_DA_LISTA', 'caminho fora de arquivos_permitidos', p);
  }
  return [...out, ...emite(codigos)];
};

export const g05 = (ctx) => {
  const c = ctx.contrato;
  const autorizadas = c.areas_autorizadas ?? [];
  const codigos = new Map();
  const autorizadasMudadas = [];
  const hash = (rev, a) => {
    const r = ctx.tenta(['rev-parse', `${rev}:${semBarra(a)}`]);
    return r.ok ? r.out.toString('utf8').trim() : '';
  };
  for (const area of ctx.areas) {
    const mudou = hash(ctx.base, area) !== hash(ctx.head, area);
    const tocados = ctx.mudados().map((m) => m.caminho).filter((p) => sob(p, area));
    if (!mudou && !tocados.length) continue;
    if (!tocados.length && !autorizadas.some((a) => sob(area, a))) agrupa(codigos, 'AREA_PROTEGIDA', 'area protegida mudada', area);
    for (const p of tocados) {
      ctx.achados.areas_tocadas.push(p);
      if (!autorizadas.some((a) => sob(p, a))) agrupa(codigos, 'AREA_PROTEGIDA', 'area protegida mudada sem autorizacao', p);
      else if (!nominal(c.arquivos_permitidos, p)) agrupa(codigos, 'AREA_FORA_DA_LISTA', 'area autorizada, mas o arquivo nao esta nominalmente na lista', p);
      else autorizadasMudadas.push(p);
    }
  }
  const out = emite(codigos);
  if (autorizadasMudadas.length) out.push(aviso('AREA_AUTORIZADA_MUDOU', 'area autorizada mudada: exige revisor', autorizadasMudadas, { exigeRevisor: true }));
  return out;
};

const eControle = (p) => CONTROLE.some((c) => (c === 'autorizacao.json' ? baixo(p).split('/').pop() === c : sob(p, c))) || sob(p, 'tools/agents');

export const g06 = (ctx) => {
  const falhas = [];
  const liberados = [];
  for (const { caminho: p } of ctx.mudados()) {
    if (!eControle(p)) continue;
    ctx.achados.controle_tocados.push(p);
    (excecao(ctx, 'G06', p) ? liberados : falhas).push(p);
  }
  const out = falhas.length ? [falha('CONTROLE', 'arquivo de controle mudado', falhas)] : [];
  if (liberados.length) out.push(aviso('EXCECAO_G06', 'controle liberado por excecoes_gate', liberados));
  return out;
};

const ARQUIVO_TESTE = /\.(?:test|spec)\.[^./]+$/i;
const PULA = /\b(?:it|describe|test|suite)\.(?:skip|only|todo)\b|\b(?:xit|xdescribe|xtest)\b|\{\s*(?:skip|todo|only)\s*:/g;
const CHAMADAS = /\b(?:it|test)\s*\(/g;
const ASSERCOES = /\b(?:expect|assert(?:\.\w+)?)\s*\(/g;
const conta = (txt, re) => (txt.match(re) ?? []).length;
const lerBlob = (ctx, rev, p) => ctx.git(['show', `${rev}:${p}`]).toString('utf8');

export const g07 = (ctx) => {
  const falhas = [];
  const liberados = [];
  const novosPulados = [];
  const reformatados = [];
  for (const { caminho: p, estado } of ctx.mudados()) {
    const snap = p.endsWith('.snap');
    if (!snap && !ARQUIVO_TESTE.test(p)) continue;
    if (estado === 'A') {
      if (!snap && conta(lerBlob(ctx, ctx.head, p), PULA)) novosPulados.push(p);
      continue;
    }
    const motivos = [];
    if (estado === 'D') motivos.push('apagado');
    else if (snap) motivos.push('snapshot modificado');
    else {
      const antes = lerBlob(ctx, ctx.base, p);
      const depois = lerBlob(ctx, ctx.head, p);
      if (conta(depois, PULA) > conta(antes, PULA)) motivos.push('ganhou skip/only/todo');
      if (conta(depois, CHAMADAS) < conta(antes, CHAMADAS)) motivos.push('perdeu it/test');
      if (conta(depois, ASSERCOES) < conta(antes, ASSERCOES)) motivos.push('perdeu expect/assert');
      const n = ctx.numstat().get(p);
      if (!motivos.length && n?.del) reformatados.push(`${p}: +${n.add} -${n.del} linhas`);
    }
    if (!motivos.length) continue;
    (excecao(ctx, 'G07', p) ? liberados : falhas).push(`${p}: ${motivos.join(', ')}`);
  }
  const out = falhas.length ? [falha('TESTE_AFROUXADO', 'teste existente afrouxado', falhas)] : [];
  if (liberados.length) out.push(aviso('EXCECAO_G07', 'afrouxamento liberado por excecoes_gate', liberados));
  if (novosPulados.length) out.push(aviso('TESTE_NOVO_PULADO', 'teste novo com skip/only/todo', novosPulados));
  if (reformatados.length) out.push(aviso('REFORMATADO', 'linhas apagadas em teste existente, contagens iguais', reformatados));
  return out;
};

const eConfiguracao = (config, p) => {
  const n = nomeBase(p).toLowerCase();
  return config.configuracao.some((e) => (e.endsWith('*') ? n.startsWith(e.slice(0, -1).toLowerCase()) : n === e.toLowerCase()));
};

export const g08 = (ctx) => {
  const c = ctx.contrato;
  const falhas = [];
  const liberados = [];
  for (const { caminho: p } of ctx.mudados()) {
    if (!eConfiguracao(ctx.config, p) || nominal(c.arquivos_permitidos, p)) continue;
    (excecao(ctx, 'G08', p) ? liberados : falhas).push(p);
  }
  const instalados = ctx.junctions.filter((j) => {
    try {
      return !lstatSync(path.join(ctx.pista, j)).isSymbolicLink();
    } catch {
      return false; // junção que nunca existiu na pista
    }
  });
  const out = [];
  if (falhas.length) out.push(falha('CONFIGURACAO', 'configuracao mudada sem o arquivo nominal em arquivos_permitidos', falhas));
  if (instalados.length) out.push(falha('DEPENDENCIA_INSTALADA', 'node_modules deixou de ser link', instalados));
  if (liberados.length) out.push(aviso('EXCECAO_G08', 'configuracao liberada por excecoes_gate', liberados));
  return out;
};

const EMAIL = /[\w.+-]+@[A-Za-z][\w-]*\.[A-Za-z]{2,}/;
const TELEFONE = /(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}/;

const tamanhos = (ctx, caminhos) => {
  const mapa = new Map();
  for (let i = 0; i < caminhos.length; i += 200) {
    for (const l of parseZ(ctx.git(['ls-tree', '-r', '-l', '-z', ctx.head, '--', ...caminhos.slice(i, i + 200)]))) {
      const [meta, p] = l.split('\t');
      mapa.set(p, Number(meta.trim().split(/\s+/)[3]));
    }
  }
  return mapa;
};

// linhas adicionadas por arquivo, a partir de um unico diff -U0
const adicionadas = (ctx) => {
  const por = new Map();
  let atual = null;
  for (const l of ctx.git(['diff', '-U0', '--no-color', '--no-renames', ctx.base, ctx.head]).toString('utf8').split('\n')) {
    if (l.startsWith('+++ ')) {
      atual = l === '+++ /dev/null' ? null : l.slice(6);
      if (atual) por.set(atual, []);
    } else if (atual && l.startsWith('+')) por.get(atual).push(l.slice(1));
  }
  return por;
};

export const g14 = (ctx) => {
  const { config } = ctx;
  const vivos = ctx.mudados().filter((m) => m.estado !== 'D');
  const grandes = tamanhos(ctx, vivos.filter((m) => m.estado === 'A' || m.estado === 'M').map((m) => m.caminho));
  const falhas = [];
  const liberados = [];
  for (const { caminho: p } of vivos) {
    const motivo =
      (grandes.get(p) ?? 0) > config.limite_arquivo_bytes ? 'acima do limite de tamanho'
      : config.extensoes_dados.includes(extensao(p)) ? 'extensao de dados'
      : config.prefixos_dados.some((x) => baixo(p).startsWith(x)) ? 'pasta de dados'
      : null;
    if (motivo) (excecao(ctx, 'G14', p) ? liberados : falhas).push(`${p}: ${motivo}`);
  }
  const out = falhas.length ? [falha('DADO_PROIBIDO', 'dado proibido (D-091)', falhas)] : [];
  if (liberados.length) out.push(aviso('EXCECAO_G14', 'dado liberado por excecoes_gate', liberados));
  const binarios = [...ctx.numstat()].filter(([, n]) => n.add === null).map(([p]) => p);
  if (binarios.length) out.push(aviso('ARQUIVO_BINARIO', 'arquivo binario no diff', binarios));
  const contato = [...adicionadas(ctx)].filter(([, ls]) => ls.some((l) => EMAIL.test(l) || TELEFONE.test(l))).map(([p]) => p);
  if (contato.length) out.push(aviso('CONTATO_NO_DIFF', 'linha adicionada parece e-mail ou telefone', contato));
  return out;
};

export const g11 = (ctx) => {
  const r = ctx.relatorio();
  const itens = r.dados?.itens;
  if (!Array.isArray(itens)) return [item('nao_rodou', 'SEM_RELATORIO_VALIDO', 'sem itens no relatorio para conferir')];
  const criterios = ctx.contrato.criterios;
  const out = [];
  const dif = [];
  if (itens.length !== criterios.length) dif.push(`${itens.length} itens para ${criterios.length} criterios`);
  criterios.forEach((k, i) => {
    if (itens[i]?.criterio?.trim() !== k.trim()) dif.push(`item ${i + 1}: ${JSON.stringify(itens[i]?.criterio)} != ${JSON.stringify(k)}`);
  });
  if (dif.length) out.push(falha('ITENS_DIVERGENTES', 'itens do relatorio diferem dos criterios', dif));
  const inco = [];
  if (r.dados.resultado === 'ok') itens.filter((x) => x?.status === 'nao_feito').forEach((x) => inco.push(`resultado ok com nao_feito: ${x.criterio}`));
  itens.filter((x) => x?.status === 'provado_por_teste' && !String(x.evidencia ?? '').trim()).forEach((x) => inco.push(`sem evidencia: ${x.criterio}`));
  if (inco.length) out.push(falha('RESULTADO_INCOERENTE', 'resultado ou evidencia incoerente', inco));
  if (itens.some((x) => x?.status === 'hipotese_aparelho') && !ctx.mudados().some((m) => m.caminho.startsWith('apps/mobile/'))) {
    out.push(aviso('HIPOTESE_SEM_APP', 'hipotese_aparelho em tarefa sem apps/mobile/ no diff'));
  }
  return out;
};

export const g13 = (ctx) => {
  const d = ctx.meta?.duracao_s;
  if (typeof d !== 'number') return [aviso('SEM_META', 'sem meta.json com duracao (modo manual)')];
  const limite = ctx.contrato.limites.minutos * 60;
  return d > limite ? [aviso('TEMPO_ESTOUROU', `${d}s acima de ${limite}s`)] : [];
};

// o que executa comandos e do c2; ate la nunca aprova
export const pendente = (id) => () => [item('nao_rodou', 'PENDENTE_C2', `${id} executa comandos e entra no c2`)];

export const ORDEM = [
  ['G00', g00], ['G01', g01], ['G02', g02], ['G15', g15], ['G03', g03], ['G04', g04], ['G05', g05], ['G06', g06],
  ['G07', g07], ['G08', g08], ['G14', g14], ['G11', g11], ['G13', g13],
  ['G09', pendente('G09')], ['G16', pendente('G16')], ['G10', pendente('G10')], ['G12', pendente('G12')],
];

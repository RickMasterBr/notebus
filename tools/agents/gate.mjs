import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adquirirComEspera } from './lib/trava.mjs';
import { parseZ } from './lib/git.mjs';
import { montar, UsoErro } from './lib/gate/contexto.mjs';
import { g01, g00, g03, ORDEM } from './lib/gate/estaticas.mjs';
import { calcular, linha } from './lib/gate/resultado.mjs';
import { gravar } from './lib/gate/saida.mjs';
import { selecionar } from './lib/gate/minimo.mjs';
import { executar } from './lib/gate/execucao.mjs';
import { comContagem, contarChamadas, lerTap, lerVitest, novosPorArquivo } from './lib/gate/contagem.mjs';
import { compararRelatorio } from './lib/gate/comparar.mjs';

const TRAVA_MINUTOS = 60;
// as que executam comandos, na ordem do parecer
const EXEC = ['G09', 'G16', 'G10', 'G12'];
const ARQUIVO_TESTE = /\.(?:test|spec)\.[^./]+$/i;

const uso = (codigo, texto) => {
  console.error(`FALHA ${codigo} ${texto}`);
  process.exitCode = 2;
};

const it = (status, codigo, mensagem, evidencia = []) => ({ status, codigo, mensagem, evidencia });

// uma verificacao nunca derruba as outras: erro vira nao_rodou (ambiente), nao reprovacao
const rodar = (id, fn, ctx) => {
  let itens;
  try {
    itens = fn(ctx);
  } catch (e) {
    itens = [{ status: 'nao_rodou', codigo: typeof e.status === 'number' || /^GIT_/.test(e.message) ? 'ERRO_GIT' : 'ERRO_INTERNO', mensagem: String(e.message).split('\n')[0], evidencia: [] }];
  }
  return (itens.length ? itens : [{ status: 'ok', codigo: '', mensagem: '', evidencia: [] }]).map((i) => ({ id, ...i }));
};

const mesmoMapa = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

// ignorados que o git mostra agora (para ver o que os comandos criaram)
const ignorados = (ctx) => {
  const juncoes = new Set(ctx.junctions);
  const out = new Set();
  const t = parseZ(ctx.git(['status', '--porcelain=v1', '-z', '--ignored=matching', '--untracked-files=all']));
  for (let i = 0; i < t.length; i++) {
    const xy = t[i].slice(0, 2);
    if (/[RC]/.test(xy)) i++;
    else if (xy === '!!' && !juncoes.has(t[i].slice(3).replace(/\/+$/, ''))) out.add(t[i].slice(3));
  }
  return out;
};

// arquivo inexistente na revisao (novo na tarefa) conta zero chamadas
const chamadasEm = (ctx, rev, p) => {
  const r = ctx.tenta(['show', `${rev}:${p}`]);
  return r.ok ? contarChamadas(r.out.toString('utf8')) : 0;
};

// G09, G16, G10 e G12: uma rodada do minimo mais o contrato, na pista
const rodada = async (ctx, estaticas) => {
  const arquivos = ctx.mudados().map((m) => m.caminho);
  const plano = selecionar(arquivos, ctx.config.minimo_por_prefixo, ctx.contrato.comandos_validacao);
  const ignAntes = ignorados(ctx);
  const g03Antes = new Set(estaticas.filter((v) => v.id === 'G03').flatMap((v) => v.evidencia.map((e) => `${v.codigo}|${e}`)));
  const saidaFwd = ctx.saida.replace(/\\/g, '/');
  const comandos = [];
  const execucao = [];
  const ilegiveis = [];
  const pulados = [];
  for (const [n, { comando, origem }] of plano.entries()) {
    const rel = `gate/${n + 1}.txt`;
    const vitest = `gate/vitest-${n + 1}.json`;
    const c = comContagem(comando.replaceAll('{saida}', saidaFwd), `${saidaFwd}/${vitest}`);
    const r = await executar({ comando: c.executar, pista: ctx.pista, saidaArquivo: path.join(ctx.saida, rel), tempoLimiteS: ctx.config.tempo_limite_comando_s });
    comandos.push({ comando, origem, duracao_s: r.duracao_s, codigo_saida: r.codigo_saida, status: r.status, resumo: r.resumo, saida: rel });
    if (!c.leitor || r.status !== 'concluido') continue;
    try {
      const tap = c.leitor === 'tap';
      const { arquivos_pulados = [], ...numeros } = tap
        ? lerTap(readFileSync(path.join(ctx.saida, rel), 'utf8'))
        : lerVitest(readFileSync(path.join(ctx.saida, vitest), 'utf8'), c.pacote);
      execucao.push({ pacote: c.pacote, ...numeros });
      // TAP nao diz o arquivo: o pulo vale como "talvez tocado" (so aviso)
      if (tap && numeros.pulou > 0) pulados.push(null);
      pulados.push(...arquivos_pulados);
    } catch (e) {
      ilegiveis.push(`${c.pacote}: ${e.message}`);
    }
  }
  const out = [];
  const divergencias = [];
  const testes = { novos_por_arquivo: {}, execucao };

  out.push(...rodar('G09', () => {
    const mal = comandos.filter((c) => c.status === 'concluido' && c.codigo_saida !== 0);
    const nao = (status, codigo, mensagem) => {
      const l = comandos.filter((c) => c.status === status);
      return l.length ? [it('nao_rodou', codigo, mensagem, l.map((c) => c.comando))] : [];
    };
    return [
      ...(mal.length ? [it('falha', 'COMANDO_FALHOU', 'comando com codigo de saida diferente de 0', mal.map((c) => `${c.comando} (codigo ${c.codigo_saida}): ${c.resumo.split('\n')[0]}`))] : []),
      ...nao('sem_tempo', 'COMANDO_SEM_TEMPO', 'comando passou do tempo-limite'),
      ...nao('ferramenta_ausente', 'FERRAMENTA_AUSENTE', 'ferramenta do comando nao encontrada'),
      ...nao('erro', 'ERRO_AO_EXECUTAR', 'o comando nao pode ser iniciado'),
    ];
  }, ctx));

  out.push(...rodar('G16', () => {
    const itens = [];
    const headDepois = ctx.linha(['rev-parse', 'HEAD']);
    if (headDepois !== ctx.head) itens.push(it('falha', 'PISTA_MUDOU_NO_GATE', 'HEAD mudou durante o gate', [`${ctx.head} -> ${headDepois}`]));
    // so conta o que a G03 nao achava antes dos comandos
    const novas = g03(ctx).filter((v) => v.status === 'falha').flatMap((v) => v.evidencia.map((e) => ({ k: `${v.codigo}|${e}`, txt: `${v.codigo}: ${e}` }))).filter((x) => !g03Antes.has(x.k));
    if (novas.length) itens.push(it('falha', 'PISTA_MUDOU_NO_GATE', 'os comandos mudaram a pista', novas.map((x) => x.txt)));
    const cache = [...ignorados(ctx)].filter((p) => !ignAntes.has(p));
    if (cache.length) itens.push(it('aviso', 'CACHE_NOVO', 'os comandos criaram arquivos ignorados', cache));
    return itens;
  }, ctx));

  out.push(...rodar('G10', () => {
    const r = ctx.relatorio();
    if (r.erro || !r.dados || typeof r.dados !== 'object') return [it('nao_rodou', 'SEM_RELATORIO_VALIDO', 'sem relatorio legivel para comparar')];
    const cmp = compararRelatorio({ relatorio: r.dados, gateArquivos: arquivos, gateForaDaLista: ctx.achados.fora_da_lista, comandosExecutados: comandos, comandosContrato: ctx.contrato.comandos_validacao });
    divergencias.push(...cmp.divergencias);
    const por = (lista, status) => {
      const mapa = new Map();
      for (const { codigo, mensagem } of lista) mapa.set(codigo, [...(mapa.get(codigo) ?? []), mensagem]);
      return [...mapa].map(([codigo, ev]) => it(status, codigo, ev[0], ev));
    };
    return [...por(cmp.falhas, 'falha'), ...por(cmp.avisos, 'aviso')];
  }, ctx));

  out.push(...rodar('G12', () => {
    const tocados = ctx.mudados().filter((m) => (m.estado === 'A' || m.estado === 'M') && ARQUIVO_TESTE.test(m.caminho)).map((m) => m.caminho);
    const contar = (rev) => Object.fromEntries(tocados.map((p) => [p, chamadasEm(ctx, rev, p)]));
    testes.novos_por_arquivo = novosPorArquivo(contar(ctx.base), contar(ctx.head));
    const itens = [];
    const doRel = Object.fromEntries(Object.entries(ctx.relatorio().dados?.testes_novos_por_arquivo ?? {}).filter(([, n]) => n > 0));
    if (!mesmoMapa(doRel, testes.novos_por_arquivo)) {
      divergencias.push({ campo: 'testes_novos_por_arquivo', relatorio: doRel, gate: testes.novos_por_arquivo, efeito: 'aviso' });
      itens.push(it('aviso', 'CONTAGEM_DIVERGENTE', 'testes_novos_por_arquivo do relatorio difere da contagem do gate'));
    }
    const tocou = pulados.filter((p) => p === null || tocados.some((t) => p.replace(/\\/g, '/').endsWith(t)));
    if (tocou.length && tocados.length) itens.push(it('aviso', 'PULADO_EM_ARQUIVO_TOCADO', 'teste pulado na execucao com arquivo de teste tocado', tocou.filter(Boolean)));
    if (ilegiveis.length) itens.push(it('aviso', 'RESULTADO_ILEGIVEL', 'contagem de execucao ilegivel', ilegiveis));
    return itens;
  }, ctx));
  return { verificacoes: out, comandos, testes, divergencias };
};

const main = async (argv) => {
  const inicio = new Date();
  let ctx;
  try {
    ctx = montar(argv, { gatePath: fileURLToPath(import.meta.url) });
  } catch (e) {
    if (e instanceof UsoErro) return uso(e.codigo, e.message);
    throw e;
  }
  const dentro = g00(ctx);
  if (dentro.length) return uso(dentro[0].codigo, dentro[0].mensagem);

  const trava = await adquirirComEspera({
    raiz: ctx.raiz, id: ctx.id || 'gate', minutos: TRAVA_MINUTOS, max: 1, pasta: '_trava-gate',
    esperarS: Number(ctx.flags['--esperar-trava-s'] ?? 0),
    aoEsperar: (ativos, s) => console.error(`ESPERANDO_TRAVA ${s}s com a trava: ${ativos.join(', ')}`),
  });
  if (!trava.ok) return uso('GATE_OCUPADO', `outro gate em andamento (${trava.ativos.join(', ')})`);
  // o dispatch le esta linha para registrar a espera no meta.json
  if (trava.esperouS > 0) console.error(`ESPEROU_TRAVA_S ${trava.esperouS}`);
  try {
    const verificacoes = [];
    let extra = { comandos: [], testes: { novos_por_arquivo: {}, execucao: [] }, divergencias: [] };
    if (ctx.contrato) {
      for (const [id, fn] of ORDEM.filter(([i]) => !EXEC.includes(i))) verificacoes.push(...rodar(id, fn, ctx));
      const nao = (codigo, mensagem) => EXEC.map((id) => ({ id, ...it('nao_rodou', codigo, mensagem) }));
      if (ctx.flags['--so-estatico']) for (const [id, fn] of ORDEM.filter(([i]) => EXEC.includes(i))) verificacoes.push(...rodar(id, fn, ctx));
      else if (verificacoes.some((v) => v.status === 'falha') && !ctx.flags['--executar-sempre']) verificacoes.push(...nao('PULADO_POR_FALHA_ESTATICA', 'uma verificacao estatica reprovou: nada foi executado'));
      else {
        try {
          extra = await rodada(ctx, verificacoes);
          verificacoes.push(...extra.verificacoes);
        } catch (e) {
          verificacoes.push(...nao('ERRO_INTERNO', String(e.message).split('\n')[0]));
        }
      }
    } else {
      // sem contrato valido so G01 fala; o resto nao tem o que conferir
      verificacoes.push(...rodar('G01', g01, ctx));
      for (const [id] of ORDEM.filter(([i]) => i !== 'G01')) verificacoes.push({ id, status: 'nao_rodou', codigo: 'SEM_CONTRATO', mensagem: 'contrato invalido', evidencia: [] });
    }
    const r = calcular(verificacoes);
    const fim = new Date();
    let mudados = [];
    try {
      if (ctx.contrato) mudados = ctx.mudados();
    } catch {}
    const gate = {
      versao: 1,
      tarefa: ctx.id,
      contrato_sha256: ctx.contratoSha,
      base: ctx.base,
      head: ctx.head,
      branch: ctx.branch,
      gate: { caminho: ctx.gatePath, commit: '' },
      modo: ctx.modo,
      resultado: r.resultado,
      exige_revisor: r.exige_revisor,
      verificacoes: verificacoes.map(({ exigeRevisor, ...v }) => v),
      arquivos: { mudados: mudados.map((m) => ({ caminho: m.caminho, estado: m.estado, modo: m.modo })), ...ctx.achados },
      comandos: extra.comandos,
      testes: extra.testes,
      divergencias: extra.divergencias,
      avisos: r.avisos,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      duracao_s: (fim - inicio) / 1000,
    };
    gravar(ctx.saida, gate);
    console.log(linha({ resultado: r.resultado, id: ctx.id, head: ctx.head, verificacoes }));
    process.exitCode = r.codigo;
  } finally {
    trava.liberar();
  }
};

try {
  await main(process.argv.slice(2));
} catch (e) {
  uso('ERRO_INTERNO', String(e.stack ?? e.message).split('\n')[0]);
}

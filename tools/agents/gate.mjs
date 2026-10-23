import { fileURLToPath } from 'node:url';
import { adquirir } from './lib/trava.mjs';
import { montar, UsoErro } from './lib/gate/contexto.mjs';
import { g01, g00, ORDEM } from './lib/gate/estaticas.mjs';
import { calcular, linha } from './lib/gate/resultado.mjs';
import { gravar } from './lib/gate/saida.mjs';

const TRAVA_MINUTOS = 60;

const uso = (codigo, texto) => {
  console.error(`FALHA ${codigo} ${texto}`);
  process.exitCode = 2;
};

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

const main = (argv) => {
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

  const trava = adquirir({ raiz: ctx.raiz, id: ctx.id || 'gate', minutos: TRAVA_MINUTOS, max: 1, pasta: '_trava-gate' });
  if (!trava.ok) return uso('GATE_OCUPADO', `outro gate em andamento (${trava.ativos.join(', ')})`);
  try {
    const verificacoes = [];
    if (ctx.contrato) for (const [id, fn] of ORDEM) verificacoes.push(...rodar(id, fn, ctx));
    else {
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
      comandos: [],
      testes: { novos_por_arquivo: {}, execucao: [] },
      divergencias: [],
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
  main(process.argv.slice(2));
} catch (e) {
  uso('ERRO_INTERNO', String(e.stack ?? e.message).split('\n')[0]);
}

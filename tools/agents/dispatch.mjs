import { spawn, execFileSync } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lerJson } from './lib/json.mjs';
import { validar } from './lib/schema.mjs';
import { lerContrato, ContratoErro } from './lib/contrato.mjs';
import { adaptador } from './lib/harness/index.mjs';
import { planejar, montarPrompt } from './lib/despacho.mjs';
import { adquirir } from './lib/trava.mjs';
import { retrato } from './lib/retrato.mjs';

class Falha extends Error {
  constructor(codigo, texto, saida, linhas = []) {
    super(texto);
    this.codigo = codigo;
    this.saida = saida;
    this.linhas = linhas;
  }
}

const COM_VALOR = ['--raiz', '--repo', '--schemas', '--harness-falso', '--max-simultaneas', '--timeout-ms'];
const inteiro = (nome, v) => {
  if (!/^[1-9]\d*$/.test(v ?? '')) throw new Falha('USO', `${nome} pede um inteiro positivo: ${v}`, 2);
  return Number(v);
};

const lerArgs = (argv) => {
  const o = { dryRun: false, posicionais: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (COM_VALOR.includes(a)) {
      if (argv[i + 1] === undefined) throw new Falha('USO', `${a} pede um valor`, 2);
      o[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) throw new Falha('USO', `flag desconhecida: ${a}`, 2);
    else o.posicionais.push(a);
  }
  if (o.posicionais.length !== 1) throw new Falha('USO', 'uso: node tools/agents/dispatch.mjs <contrato.md> [--dry-run] [--raiz <pasta>] [--repo <pasta>] [--schemas <pasta>] [--harness-falso <script.mjs>] [--max-simultaneas <n>] [--timeout-ms <n>]', 2);
  if (o['max-simultaneas'] !== undefined) o.max = inteiro('--max-simultaneas', o['max-simultaneas']);
  if (o['timeout-ms'] !== undefined) o.timeout = inteiro('--timeout-ms', o['timeout-ms']);
  return o;
};

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const criarPista = (plano, repo) => {
  try {
    git(repo, 'worktree', 'add', plano.pista.caminho, '-b', plano.branch, plano.base);
  } catch (e) {
    throw new Falha('WORKTREE', String(e.stderr || e.message).trim(), 2);
  }
  for (const { de, para } of plano.junctions) {
    if (existsSync(de) && existsSync(path.dirname(para)) && !existsSync(para)) symlinkSync(de, para, 'junction');
    else console.error(`junction pulada: ${para}`);
  }
  const head = git(plano.pista.caminho, 'rev-parse', '--short', 'HEAD');
  if (!head.startsWith(plano.base) && !plano.base.startsWith(head)) throw new Falha('BASE_DIVERGENTE', `pista em ${head}, contrato pede ${plano.base}`, 2);
};

const matar = (filho) => {
  // shortcut: taskkill leva a arvore toda so no Windows; fora dele mata so o filho direto. Rever se rodar em Linux/macOS.
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(filho.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    } catch {
      // ja morreu: cai no kill simples
    }
  }
  filho.kill('SIGKILL');
};

const executar = ({ exe, args }, { cwd, saida, stderr, timeout }) =>
  new Promise((resolve) => {
    const fds = [openSync(saida, 'w'), openSync(stderr, 'w')];
    let timer;
    let acabou = false;
    let estourou = false;
    const fim = (r) => {
      if (acabou) return;
      acabou = true;
      clearTimeout(timer);
      fds.forEach(closeSync);
      resolve(r);
    };
    const filho = spawn(exe, args, { cwd, stdio: ['ignore', ...fds], windowsHide: true });
    timer = setTimeout(() => {
      estourou = true;
      matar(filho);
    }, timeout);
    filho.on('error', (e) => fim({ erro: e }));
    filho.on('close', (codigo) => fim(estourou ? { tempo: true } : { codigo }));
  });

const imprimeErros = (erros) => erros.map((e) => `${e.caminho || '/'} ${e.codigo} ${e.mensagem}`);

const rodar = async ({ plano, harness, comando, timeout, schemaRelatorio, falso, repo }) => {
  const pista = plano.pista.caminho;
  const a = plano.arquivosDespacho;
  const reportPista = path.join(pista, '.agent', 'report.json');
  const meta = { id: plano.id, harness: harness.nome, exe: comando.exe, harness_falso: falso, inicio: new Date().toISOString(), retrato: null, fim: null, duracao_s: null, codigo_saida: null, meta: null, validacao: null, avisos: [], erro: null };
  const t0 = Date.now();
  const grava = () => {
    meta.fim = new Date().toISOString();
    meta.duracao_s = (Date.now() - t0) / 1000;
    writeFileSync(a.meta, JSON.stringify(meta, null, 2));
  };
  const falha = (codigo, texto, saida, linhas) => {
    meta.erro = codigo;
    grava();
    return new Falha(codigo, texto, saida, linhas);
  };

  // antes do harness: o que ele mudar no repositorio principal aparece na comparacao do gate
  try {
    // DISPATCH_RETRATO_FALHA: gancho so de teste
    if (process.env.DISPATCH_RETRATO_FALHA) throw new Error('retrato forcado a falhar');
    meta.retrato = retrato({ repo });
  } catch {
    meta.avisos.push('RETRATO_FALHOU');
  }

  const r = await executar(comando, { cwd: pista, saida: a.saida, stderr: a.stderr, timeout });
  if (r.erro) {
    const nao = r.erro.code === 'ENOENT';
    // hipotese (M3): shims .cmd do Windows podem exigir shell
    throw falha(nao ? 'EXECUTAVEL_NAO_ENCONTRADO' : 'EXECUCAO', nao ? `${comando.exe} nao esta no PATH` : r.erro.message, nao ? 2 : 1);
  }
  meta.codigo_saida = r.codigo ?? null;
  if (r.tempo) throw falha('TEMPO_ESGOTADO', `passou de ${timeout} ms`, 1);

  const lido = harness.lerSaida(readFileSync(a.saida, 'utf8'));
  meta.meta = lido.meta;
  let relatorio = lido.relatorio;
  const doStdout = Boolean(relatorio);
  if (!relatorio) {
    try {
      relatorio = lerJson(reportPista);
    } catch (e) {
      throw falha('SEM_RELATORIO', `sem relatorio (saida ${r.codigo}; ${lido.erro?.codigo ?? '-'}; ${e.code ?? e.name})`, 1);
    }
  }
  if (relatorio?.tarefa !== plano.id) meta.avisos.push('TAREFA_DIFERENTE');
  const erros = validar(lerJson(schemaRelatorio), relatorio).erros;
  if (erros.length) {
    meta.validacao = 'erros';
    throw falha('RELATORIO_INVALIDO', 'relatorio fora do schema', 1, imprimeErros(erros));
  }
  meta.validacao = 'ok';
  writeFileSync(a.relatorio, JSON.stringify(relatorio, null, 2));
  if (doStdout) writeFileSync(reportPista, JSON.stringify(relatorio, null, 2));
  grava();
  return `OK ${plano.id} relatorio valido em ${a.relatorio}`;
};

const principal = async (argv) => {
  const o = lerArgs(argv);
  const arquivo = path.resolve(o.posicionais[0]);
  if (!existsSync(arquivo)) throw new Falha('USO', `contrato nao encontrado: ${arquivo}`, 2);
  const repo = path.resolve(o.repo ?? git(process.cwd(), 'rev-parse', '--show-toplevel'));
  const raiz = path.resolve(o.raiz ?? path.dirname(repo));
  const schemas = path.resolve(o.schemas ?? path.join(repo, 'docs', 'v1', 'infra', 'modelos'));
  const schemaContrato = path.join(schemas, 'contrato.schema.json');
  const schemaRelatorio = path.join(schemas, 'relatorio.schema.json');
  for (const s of [schemaContrato, schemaRelatorio]) if (!existsSync(s)) throw new Falha('USO', `schema nao encontrado: ${s}`, 2);

  let contrato;
  try {
    contrato = lerContrato(arquivo, { schemaPath: schemaContrato });
  } catch (e) {
    if (e instanceof ContratoErro) throw new Falha('CONTRATO_INVALIDO', 'contrato invalido', 2, imprimeErros(e.erros));
    throw e;
  }
  const plano = planejar(contrato, { raiz, repo });
  const harness = adaptador(contrato.executor.harness);
  let comando = harness.montarComando(contrato, { prompt: montarPrompt(contrato), schemaTexto: readFileSync(schemaRelatorio, 'utf8'), schemaCaminho: plano.arquivosDespacho.schema });
  if (o['harness-falso']) comando = { exe: process.execPath, args: [path.resolve(o['harness-falso']), ...comando.args] };

  if (o.dryRun) {
    console.log(JSON.stringify({ plano, comando }, null, 2));
    return `OK ${plano.id} dry-run`;
  }

  const trava = adquirir({ raiz, id: plano.id, minutos: contrato.limites.minutos, max: o.max ?? 2 });
  if (!trava.ok) throw new Falha(trava.codigo, `ativos: ${trava.ativos.join(', ') || '-'}`, 2);
  try {
    if (existsSync(plano.pista.caminho)) throw new Falha('PISTA_EXISTE', plano.pista.caminho, 2);
    criarPista(plano, repo);
    mkdirSync(path.join(plano.pista.caminho, '.agent'), { recursive: true });
    copyFileSync(arquivo, path.join(plano.pista.caminho, '.agent', 'contrato.md'));
    mkdirSync(plano.despachoDir, { recursive: true });
    const a = plano.arquivosDespacho;
    writeFileSync(a.autorizacao, JSON.stringify({ tarefa: plano.id, areas_autorizadas: contrato.areas_autorizadas, arquivos_permitidos: contrato.arquivos_permitidos }, null, 2));
    copyFileSync(schemaRelatorio, a.schema);
    return await rodar({ plano, harness, comando, timeout: o.timeout ?? contrato.limites.minutos * 60000, schemaRelatorio, falso: Boolean(o['harness-falso']), repo });
  } finally {
    trava.liberar();
  }
};

principal(process.argv.slice(2)).then(
  (msg) => console.log(msg),
  (e) => {
    if (!(e instanceof Falha)) {
      console.error(`FALHA ERRO_INESPERADO ${e.stack ?? e}`);
      process.exitCode = 2;
      return;
    }
    e.linhas.forEach((l) => console.log(l));
    console.error(`FALHA ${e.codigo} ${e.message}`);
    process.exitCode = e.saida;
  },
);

import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lerJson } from './lib/json.mjs';
import { validar } from './lib/schema.mjs';
import { lerContrato, ContratoErro } from './lib/contrato.mjs';
import { adaptador } from './lib/harness/index.mjs';
import { planejar, montarPrompt, montarHooksClaude, montarHooksAgy, montarPermissoesOpencode } from './lib/despacho.mjs';
import { CONTROLE } from './hooks/protected-paths.mjs';
import { adquirir } from './lib/trava.mjs';
import { retrato } from './lib/retrato.mjs';
import { resolverExecutavel, comandoParaSpawn, ErroExecutavel } from './lib/executavel.mjs';

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

// a causa real de uma falha do harness costuma estar so no stderr
const lerStderr = (caminho) => {
  try {
    return readFileSync(caminho, 'utf8').split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 200) ?? '';
  } catch {
    return '';
  }
};

const executar = ({ exe, args, opcoes }, { cwd, saida, stderr, timeout }) =>
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
    const filho = spawn(exe, args, { cwd, stdio: ['ignore', ...fds], windowsHide: true, ...opcoes });
    timer = setTimeout(() => {
      estourou = true;
      matar(filho);
    }, timeout);
    filho.on('error', (e) => fim({ erro: e }));
    filho.on('close', (codigo) => fim(estourou ? { tempo: true } : { codigo }));
  });

const imprimeErros = (erros) => erros.map((e) => `${e.caminho || '/'} ${e.codigo} ${e.mensagem}`);

// o arquivo ja esta na base: gravar por cima mudaria um arquivo rastreado
const naBase = (repo, base, arquivo) => {
  try {
    git(repo, 'cat-file', '-e', `${base}:${arquivo}`);
    return true;
  } catch {
    return false;
  }
};

// grava o hook do harness (e a copia do despacho, byte a byte) e devolve o que vai ao meta.json
const gravarHook = ({ plano, contrato, repo }) => {
  const { hook } = plano;
  const a = plano.arquivosDespacho;
  const texto = JSON.stringify(
    hook.tipo === 'claude' ? montarHooksClaude({ repo, autorizacao: a.autorizacao, log: a.hookLog })
    : hook.tipo === 'agy' ? montarHooksAgy({ repo, autorizacao: a.autorizacao, log: a.hookLog })
    : montarPermissoesOpencode(contrato, { areas: lerJson(path.join(repo, 'tools/agents/hooks/protected-paths.json')), controle: CONTROLE }),
    null,
    2,
  );
  const arquivo = hook.arquivoPista ?? hook.settings;
  mkdirSync(path.dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, texto);
  if (hook.copia) writeFileSync(hook.copia, texto);
  return { tipo: hook.tipo, arquivo, sha256: createHash('sha256').update(texto).digest('hex') };
};

const rodar = async ({ plano, harness, comando, exec, resolvido, timeout, schemaRelatorio, falso, repo, hook }) => {
  const pista = plano.pista.caminho;
  const a = plano.arquivosDespacho;
  const reportPista = path.join(pista, '.agent', 'report.json');
  const meta = { id: plano.id, harness: harness.nome, exe: comando.exe, exe_resolvido: resolvido?.caminho ?? null, harness_falso: falso, inicio: new Date().toISOString(), hook, retrato: null, fim: null, duracao_s: null, codigo_saida: null, meta: null, validacao: null, avisos: [], erro: null };
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

  const r = await executar(exec, { cwd: pista, saida: a.saida, stderr: a.stderr, timeout });
  if (r.erro) {
    const nao = r.erro.code === 'ENOENT';
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
      const linha = lerStderr(a.stderr);
      throw falha('SEM_RELATORIO', `sem relatorio (saida ${r.codigo}; ${lido.erro?.codigo ?? '-'}; ${e.code ?? e.name})${linha ? ` | stderr: ${linha}` : ''}`, 1);
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
  for (const f of ['protected-paths.mjs', 'protected-paths.json']) {
    const arq = path.join(repo, 'tools/agents/hooks', f);
    if (plano.hook.ligado && !existsSync(arq)) throw new Falha('HOOK_AUSENTE', `${arq} nao existe: o hook ficaria desligado (hook que falha nao bloqueia); confira o --repo`, 2);
  }
  const harness = adaptador(contrato.executor.harness);
  let comando = harness.montarComando(contrato, { prompt: montarPrompt(contrato), schemaTexto: readFileSync(schemaRelatorio, 'utf8'), schemaCaminho: plano.arquivosDespacho.schema, settingsCaminho: plano.hook.ligado ? plano.hook.settings : undefined });
  if (o['harness-falso']) comando = { exe: process.execPath, args: [path.resolve(o['harness-falso']), ...comando.args] };

  // DISPATCH_RESOLVIDO_TESTE: gancho so de teste (JSON { caminho, tipo }), para exercitar o atalho .cmd fora do Windows
  const resolvido = process.env.DISPATCH_RESOLVIDO_TESTE ? JSON.parse(process.env.DISPATCH_RESOLVIDO_TESTE) : resolverExecutavel(comando.exe);
  let exec;
  try {
    exec = comandoParaSpawn(comando, { resolvido });
  } catch (e) {
    if (e instanceof ErroExecutavel) throw new Falha(e.codigo, e.message, 2);
    throw e;
  }

  if (o.dryRun) {
    console.log(JSON.stringify({ plano, comando, execucao: { exe: resolvido?.caminho ?? comando.exe, tipo: resolvido?.tipo ?? 'exe' } }, null, 2));
    return `OK ${plano.id} dry-run`;
  }

  const { hook } = plano;
  if (hook.tipo === 'agy') {
    // o command do agy vai sem aspas: um espaco partiria o caminho em silencio
    const { autorizacao, hookLog } = plano.arquivosDespacho;
    const comEspaco = [path.join(repo, 'tools/agents/hooks/protected-paths.mjs'), autorizacao, hookLog].find((p) => /\s/.test(p));
    if (comEspaco) throw new Falha('HOOK_CAMINHO_COM_ESPACO', `${comEspaco} tem espaco: o agy nao entende aspas no hook; use um caminho sem espaco (--repo/--raiz)`, 2);
  }
  if (hook.arquivoPista) {
    const rel = path.relative(plano.pista.caminho, hook.arquivoPista).replace(/\\/g, '/');
    if (naBase(repo, plano.base, rel)) throw new Falha('HOOK_JA_EXISTE', `a base ${plano.base} ja tem ${rel}: o dispatch nao o sobrescreve`, 2);
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
    const hookMeta = hook.ligado ? gravarHook({ plano, contrato, repo }) : null;
    copyFileSync(schemaRelatorio, a.schema);
    return await rodar({ plano, harness, comando, exec, resolvido, timeout: o.timeout ?? contrato.limites.minutos * 60000, schemaRelatorio, falso: Boolean(o['harness-falso']), repo, hook: hookMeta });
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

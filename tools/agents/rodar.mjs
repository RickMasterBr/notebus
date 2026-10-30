import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { lerContrato, ContratoErro } from './lib/contrato.mjs';
import { RodarErro, parseId, caminhosPadrao, lerCommitVigente, caminhoGate, resumoAntes, resumoFinal, LEIA_ME, ARQUIVOS_GUARDADOS, caminhosRegistro, lerPct, pastaLivre } from './lib/rodar.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
// toda saida e ASCII: o PowerShell do Rick mostra acento mal
const ascii = (s) => s.replace(/[^\x00-\x7F]/g, '?');
const imprime = (s) => console.log(ascii(s));

const COM_VALOR = ['--raiz', '--docs', '--schemas', '--gate-vigente', '--harness-falso', '--gate-falso', '--pct', '--csv', '--registros'];
const SEM_VALOR = ['--sim', '--dry-run', '--so-estatico', '--sem-registro'];

const lerArgs = (argv) => {
  const o = { posicionais: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (SEM_VALOR.includes(a)) o[a.slice(2)] = true;
    else if (COM_VALOR.includes(a)) {
      if (argv[i + 1] === undefined) throw new RodarErro('USO', `${a} pede um valor`);
      o[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) throw new RodarErro('USO', `flag desconhecida: ${a}`);
    else o.posicionais.push(a);
  }
  if (o.posicionais.length !== 1) throw new RodarErro('USO', 'uso: rodar <id> [--sim] [--dry-run] [--so-estatico] [--sem-registro] [--pct n]');
  if (o.pct !== undefined && !Number.isInteger(lerPct(o.pct))) throw new RodarErro('USO', '--pct pede um numero de 0 a 100');
  return o;
};

// um leitor so para a entrada toda: o ENTER e o percentual vem da mesma fila de linhas
let leitor = null;
const proximaLinha = async () => {
  leitor ??= readline.createInterface({ input: process.stdin });
  leitor.it ??= leitor[Symbol.asyncIterator]();
  const r = await leitor.it.next();
  return r.done ? null : r.value;
};

// fim da entrada sem linha = cancelado
const pedeEnter = async () => (await proximaLinha()) !== null;

const despachar = (args) =>
  new Promise((resolve, reject) => {
    // RODAR_DISPATCH_TESTE: gancho so de teste, troca o dispatch.mjs por um falso
    const filho = spawn(process.execPath, [process.env.RODAR_DISPATCH_TESTE ?? path.join(aqui, 'dispatch.mjs'), ...args], { stdio: 'inherit' });
    filho.on('error', reject);
    filho.on('close', (c) => resolve(c ?? 1));
  });

const lerOpcional = (arq) => {
  try {
    return JSON.parse(readFileSync(arq, 'utf8'));
  } catch {
    return null;
  }
};

const aviso = (s) => console.error(ascii(`AVISO ${s}`));

// trace real (ou RODAR_TRACE_TESTE nos testes); falha vira aviso e nunca muda o codigo de saida
const trace = (args, falha) => {
  const r = spawnSync(process.execPath, [process.env.RODAR_TRACE_TESTE ?? path.join(aqui, 'trace.mjs'), ...args], { stdio: 'inherit' });
  if (r.status !== 0) aviso(`${falha} (${r.status ?? r.error?.code})`);
  return r.status === 0;
};

// so copia bytes; nao abre os JSON
const arquivar = (origem, arquivo, id) => {
  try {
    const dest = pastaLivre(arquivo, id, existsSync);
    mkdirSync(dest, { recursive: true });
    for (const nome of ARQUIVOS_GUARDADOS) if (existsSync(path.join(origem, nome))) copyFileSync(path.join(origem, nome), path.join(dest, nome));
    if (!existsSync(path.join(arquivo, 'LEIA-ME.md'))) writeFileSync(path.join(arquivo, 'LEIA-ME.md'), LEIA_ME);
    return dest;
  } catch (e) {
    aviso(`arquivo nao guardado (${e.code ?? e.message})`);
    return null;
  }
};

const perguntaPct = async () => {
  for (let i = 0; i < 2; i++) {
    process.stdout.write('Quanto % do limite gastou? (ENTER pula, numero de 0 a 100) ');
    const t = await proximaLinha();
    if (t === null) break;
    const n = lerPct(t);
    if (n !== undefined) return n;
  }
  aviso('percentual nao anotado');
  return null;
};

const registrar = async (o, { id, contrato, raiz, docs }) => {
  const c = caminhosRegistro({ docs, csv: o.csv, registros: o.registros });
  const origem = path.join(raiz, '_despacho', id);
  trace([contrato, '--raiz', raiz, '--csv', c.csv, '--registros', c.registros], 'registro nao gerado');
  const guardado = arquivar(origem, c.arquivo, id);
  const pct = o.pct !== undefined ? lerPct(o.pct) : o.sim ? null : await perguntaPct();
  if (pct !== null) trace(['anotar', id, '--csv', c.csv, '--pct', String(pct)], 'percentual nao anotado');
  const reg = path.join(c.registros, `${id}.md`);
  if (existsSync(reg)) imprime(`Registro: ${reg}`);
  if (guardado) imprime(`Arquivo: ${guardado}`);
};

const principal = async (argv) => {
  const o = lerArgs(argv);
  const id = parseId(o.posicionais[0]);
  const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: aqui, encoding: 'utf8' }).trim();
  const raiz = path.resolve(o.raiz ?? path.dirname(repo));
  const pad = caminhosPadrao({ raiz });
  const docs = o.docs ? path.resolve(o.docs) : pad.docs;
  const schemas = path.resolve(o.schemas ?? path.join(docs, 'v1', 'infra', 'modelos'));
  const contrato = path.join(docs, 'v1', 'contratos', `${id}.md`);
  if (!existsSync(contrato)) throw new RodarErro('CONTRATO_AUSENTE', `contrato nao encontrado: ${contrato}`);
  let cab;
  try {
    cab = lerContrato(contrato, { schemaPath: path.join(schemas, 'contrato.schema.json') });
  } catch (e) {
    if (e instanceof ContratoErro) throw new RodarErro('CONTRATO_INVALIDO', `${e.erros[0].caminho} ${e.erros[0].mensagem}`);
    throw e;
  }
  if (/^0+$/.test(cab.base.commit)) throw new RodarErro('BASE_NAO_PREENCHIDA', `base ${cab.base.commit}: troque pelo commit real antes de rodar`);

  let gate;
  let gateCommit;
  if (o['gate-falso']) {
    gate = path.resolve(o['gate-falso']);
    gateCommit = 'falso';
  } else {
    const vigente = path.resolve(o['gate-vigente'] ?? pad.gateVigente);
    if (!existsSync(vigente)) throw new RodarErro('GATE_VIGENTE_AUSENTE', `${vigente} nao existe`);
    gateCommit = lerCommitVigente(readFileSync(vigente, 'utf8'));
    gate = caminhoGate(raiz, gateCommit);
    if (!existsSync(gate)) throw new RodarErro('GATE_AUSENTE', `gate nao encontrado: ${gate}`);
  }

  imprime(resumoAntes(cab, { gateCommit }));
  if (!o.sim && !o['dry-run'] && !(await pedeEnter())) throw new RodarErro('CANCELADO', 'nada foi despachado');

  const codigo = await despachar([
    contrato, '--repo', repo, '--raiz', raiz, '--schemas', schemas, '--gate', gate,
    ...(o['so-estatico'] ? ['--gate-so-estatico'] : []),
    ...(o['harness-falso'] ? ['--harness-falso', path.resolve(o['harness-falso'])] : []),
    ...(o['dry-run'] ? ['--dry-run'] : []),
  ]);
  if (!o['dry-run']) {
    const dir = path.join(raiz, '_despacho', id);
    const achado = (nome) => (existsSync(path.join(dir, nome)) ? path.join(dir, nome) : null);
    imprime(resumoFinal(lerOpcional(path.join(dir, 'meta.json')), lerOpcional(path.join(dir, 'gate.json')), codigo, { relatorio: achado('relatorio.json'), meta: achado('meta.json') }));
    if (!o['sem-registro'] && codigo !== 2) await registrar(o, { id, contrato, raiz, docs });
  }
  leitor?.close();
  return codigo;
};

principal(process.argv.slice(2)).then(
  (c) => { process.exitCode = c; },
  (e) => {
    if (!(e instanceof RodarErro)) {
      console.error(ascii(`FALHA ERRO_INESPERADO ${e.stack ?? e}`));
      process.exitCode = 2;
      return;
    }
    console.error(ascii(`${e.codigo} ${e.message}`));
    process.exitCode = e.codigo === 'CANCELADO' ? 1 : 2;
  },
);

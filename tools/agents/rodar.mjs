import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { lerContrato, ContratoErro } from './lib/contrato.mjs';
import { RodarErro, parseId, caminhosPadrao, lerCommitVigente, caminhoGate, resumoAntes, resumoFinal } from './lib/rodar.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
// toda saida e ASCII: o PowerShell do Rick mostra acento mal
const ascii = (s) => s.replace(/[^\x00-\x7F]/g, '?');
const imprime = (s) => console.log(ascii(s));

const COM_VALOR = ['--raiz', '--docs', '--schemas', '--gate-vigente', '--harness-falso', '--gate-falso'];
const SEM_VALOR = ['--sim', '--dry-run', '--so-estatico'];

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
  if (o.posicionais.length !== 1) throw new RodarErro('USO', 'uso: rodar <id> [--sim] [--dry-run] [--so-estatico]');
  return o;
};

// fim da entrada sem linha = cancelado
const pedeEnter = () =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin });
    rl.once('line', () => { resolve(true); rl.close(); });
    rl.once('close', () => resolve(false));
  });

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
  }
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

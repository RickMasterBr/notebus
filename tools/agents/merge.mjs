import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lerJson } from './lib/json.mjs';
import { lerContrato, ContratoErro } from './lib/contrato.mjs';
import { planejar } from './lib/despacho.mjs';
import { removerJuncao } from './lib/juncao.mjs';

class Falha extends Error {
  constructor(codigo, texto, saida, linhas = []) {
    super(texto);
    this.codigo = codigo;
    this.saida = saida;
    this.linhas = linhas;
  }
}

const COM_VALOR = ['--destino', '--gate', '--repo', '--raiz', '--schemas', '--mensagem'];
const SEM_VALOR = ['--confirmo', '--revisado', '--permitir-main'];
const USO = 'uso: node tools/agents/merge.mjs <contrato.md> --destino <branch> [--confirmo] [--revisado] [--gate <arquivo>] [--repo <pasta>] [--raiz <pasta>] [--schemas <pasta>] [--mensagem <texto>] [--permitir-main]';

const lerArgs = (argv) => {
  const o = { posicionais: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (SEM_VALOR.includes(a)) o[a.slice(2)] = true;
    else if (COM_VALOR.includes(a)) {
      if (argv[i + 1] === undefined) throw new Falha('USO', `${a} pede um valor`, 2);
      o[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) throw new Falha('USO', `flag desconhecida: ${a}`, 2);
    else o.posicionais.push(a);
  }
  if (o.posicionais.length !== 1) throw new Falha('USO', USO, 2);
  if (!o.destino) throw new Falha('USO', `--destino e obrigatorio. ${USO}`, 2);
  return o;
};

// fsmonitor off: o config da pista nao pode fazer o git rodar programa
const rodarGit = (cwd, args, opcoes = {}) => spawnSync('git', ['-c', 'core.fsmonitor=false', '-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opcoes });
const git = (cwd, ...args) => {
  const r = rodarGit(cwd, args);
  if (r.status !== 0) throw new Error(`git ${args[0]} falhou: ${(r.stderr || r.error?.message || '').trim()}`);
  return r.stdout.trim();
};
// null quando o git sai com erro (ex.: ref que nao existe)
const tenta = (cwd, ...args) => {
  const r = rodarGit(cwd, args);
  return r.status === 0 ? r.stdout.trim() : null;
};

const imprimeErros = (erros) => erros.map((e) => `${e.caminho || '/'} ${e.codigo} ${e.mensagem}`);

const preCondicoes = ({ o, arquivo, repo, plano }) => {
  const gatePath = o.gate ? path.resolve(o.gate) : path.join(plano.despachoDir, 'gate.json');
  let gate;
  try {
    gate = lerJson(gatePath);
  } catch (e) {
    throw new Falha('SEM_GATE', `gate.json nao lido (${gatePath}): ${e.code ?? e.name}`, 2);
  }
  if (gate?.versao !== 1) throw new Falha('SEM_GATE', `gate.json versao ${gate?.versao}, so a 1 e conhecida`, 2);
  if (gate.resultado !== 'aprovado') throw new Falha('GATE_NAO_APROVOU', `resultado do gate: ${gate.resultado}`, 2);
  const branchHead = tenta(repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${plano.branch}^{commit}`);
  // comparacao exata: prefixo nao vale. Branch ausente fica para a pre-condicao 6, na ordem do contrato
  if (branchHead !== null && gate.head !== branchHead) throw new Falha('GATE_DE_OUTRO_COMMIT', `gate aprovou ${gate.head}, a branch esta em ${branchHead}`, 2);
  const sha = createHash('sha256').update(readFileSync(arquivo)).digest('hex');
  if (gate.contrato_sha256 !== sha) throw new Falha('GATE_DE_OUTRO_CONTRATO', 'o contrato mudou depois do gate', 2);
  if (gate.exige_revisor === true && !o.revisado) throw new Falha('FALTA_REVISOR', 'o gate pede revisor: confirme com --revisado', 2);
  if (git(repo, 'status', '--porcelain') !== '') throw new Falha('REPO_SUJO', `${repo} tem mudancas nao commitadas`, 2);
  const existe = tenta(repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${o.destino}`) !== null;
  if (o.destino === 'main' && !o['permitir-main']) throw new Falha('DESTINO_PROIBIDO', 'destino main exige --permitir-main', 2);
  if (!existe) throw new Falha('DESTINO_PROIBIDO', `destino inexistente: ${o.destino}`, 2);
  if (o.destino === plano.branch) throw new Falha('DESTINO_PROIBIDO', 'destino igual a branch da tarefa', 2);
  if (branchHead === null) throw new Falha('BRANCH_NAO_EXISTE', plano.branch, 2);
  if (tenta(repo, 'symbolic-ref', '--short', '-q', 'HEAD') !== o.destino) throw new Falha('DESTINO_NAO_ATUAL', `o repositorio nao esta em ${o.destino}; o merge nao faz checkout`, 2);
  return branchHead;
};

const unir = ({ repo, plano, mensagem }) => {
  // pasta de hooks vazia: um hook do repositorio nao roda codigo no merge
  const vazia = mkdtempSync(path.join(tmpdir(), 'merge-hooks-'));
  try {
    const r = rodarGit(repo, ['-c', `core.hooksPath=${vazia}`, 'merge', '--no-ff', '-m', mensagem, plano.branch]);
    if (r.status === 0) return;
    if (tenta(repo, 'rev-parse', '-q', '--verify', 'MERGE_HEAD') !== null) git(repo, 'merge', '--abort');
    throw new Falha('CONFLITO', `merge desfeito: ${(r.stdout + r.stderr).trim().split('\n')[0]}`, 1);
  } finally {
    rmSync(vazia, { recursive: true, force: true });
  }
};

// so roda depois do merge feito: o ramo nunca e apagado antes (git branch -d, minusculo, recusa o nao mergeado)
const limpar = ({ repo, plano, destino }) => {
  const pista = plano.pista.caminho;
  const aMao = `o merge ja ocorreu em ${destino}: falta limpar a pista e a branch a mao`;
  for (const { para } of plano.junctions) removerJuncao(para);
  if (existsSync(pista)) {
    const sujos = git(pista, 'status', '--porcelain', '--untracked-files=all').split('\n').filter((l) => l && !l.startsWith('?? .agent/'));
    if (sujos.length) throw new Falha('PISTA_SUJA', `${sujos.join(', ')}; ${aMao}`, 1);
    const agente = path.join(pista, '.agent');
    // .agent e da pista e nao e link: o git recusaria remover a worktree por causa dele
    if (existsSync(agente) && lstatSync(agente).isDirectory()) rmSync(agente, { recursive: true, force: true });
    const r = rodarGit(repo, ['worktree', 'remove', pista]);
    if (r.status !== 0) throw new Falha('PISTA_SUJA', `${r.stderr.trim()}; ${aMao}`, 1);
  }
  const r = rodarGit(repo, ['branch', '-d', plano.branch]);
  if (r.status !== 0) throw new Falha('RAMO_NAO_APAGADO', `${r.stderr.trim()}; ${aMao}`, 1);
};

const principal = (argv) => {
  const o = lerArgs(argv);
  const arquivo = path.resolve(o.posicionais[0]);
  if (!existsSync(arquivo)) throw new Falha('USO', `contrato nao encontrado: ${arquivo}`, 2);
  const repo = path.resolve(o.repo ?? git(process.cwd(), 'rev-parse', '--show-toplevel'));
  const raiz = path.resolve(o.raiz ?? path.dirname(repo));
  const schemaContrato = path.join(path.resolve(o.schemas ?? path.join(repo, 'docs', 'v1', 'infra', 'modelos')), 'contrato.schema.json');
  if (!existsSync(schemaContrato)) throw new Falha('USO', `schema nao encontrado: ${schemaContrato}`, 2);

  let contrato;
  try {
    contrato = lerContrato(arquivo, { schemaPath: schemaContrato });
  } catch (e) {
    if (e instanceof ContratoErro) throw new Falha('CONTRATO_INVALIDO', 'contrato invalido', 2, imprimeErros(e.erros));
    throw e;
  }
  const plano = planejar(contrato, { raiz, repo });
  const head = preCondicoes({ o, arquivo, repo, plano });

  const junctions = plano.junctions.map((j) => j.para).filter((p) => lstatSync(p, { throwIfNoEntry: false }));
  if (!o.confirmo) {
    console.log(JSON.stringify({ plano: { id: plano.id, destino: o.destino, branch: plano.branch, head, pista: plano.pista.caminho, junctions } }, null, 2));
    return `OK ${plano.id} dry-run`;
  }

  const inicio = new Date().toISOString();
  unir({ repo, plano, mensagem: o.mensagem ?? `merge: ${plano.id}` });
  const commitMerge = git(repo, 'rev-parse', 'HEAD');
  const grava = () => {
    mkdirSync(plano.despachoDir, { recursive: true });
    writeFileSync(path.join(plano.despachoDir, 'merge.json'), JSON.stringify({ id: plano.id, destino: o.destino, commit_merge: commitMerge, inicio, fim: new Date().toISOString() }, null, 2));
  };
  try {
    limpar({ repo, plano, destino: o.destino });
  } finally {
    grava();
  }
  return `OK ${plano.id} mesclado em ${o.destino} (${commitMerge.slice(0, 7)})`;
};

try {
  console.log(principal(process.argv.slice(2)));
} catch (e) {
  if (!(e instanceof Falha)) {
    console.error(`FALHA ERRO_INESPERADO ${e.stack ?? e}`);
    process.exitCode = 2;
  } else {
    e.linhas.forEach((l) => console.log(l));
    console.error(`FALHA ${e.codigo} ${e.message}`);
    process.exitCode = e.saida;
  }
}

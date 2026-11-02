import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classificar, controleDoDispatch, formatarLista, nomeLivre, ordemDeRemocao, sujeira } from './lib/descarte.mjs';
import { removerJuncao } from './lib/juncao.mjs';
import { pergunta } from './lib/pergunta.mjs';

class Falha extends Error {
  constructor(codigo, texto, saida) {
    super(texto);
    this.codigo = codigo;
    this.saida = saida;
  }
}

const COM_VALOR = ['--raiz', '--repo', '--aplicar', '--destino'];
const SEM_VALOR = ['--sim', '--apagar-branch', '--forcar'];
const USO = 'uso: node tools/agents/descartar.mjs --raiz <pasta> [--repo <pasta>] [--aplicar <pista[,pista]>] [--destino <branch>] [--sim] [--apagar-branch] [--forcar]';
// pistas que nunca saem, alem da worktree principal e da do --repo
const PROTEGIDAS = ['notebus-infra'];
// mesmas pastas de node_modules que o despacho liga com junction (lib/despacho.mjs)
const PASTAS = ['', 'apps/mobile', 'packages/domain', 'tools/licenses', 'tools/mobilis-seed', 'tools/mvp-report'];

const lerArgs = (argv) => {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (SEM_VALOR.includes(a)) o[a.slice(2)] = true;
    else if (COM_VALOR.includes(a)) {
      if (argv[i + 1] === undefined) throw new Falha('USO', `${a} pede um valor`, 2);
      o[a.slice(2)] = argv[++i];
    } else throw new Falha('USO', `argumento desconhecido: ${a}. ${USO}`, 2);
  }
  if (!o.raiz) throw new Falha('USO', `--raiz e obrigatorio. ${USO}`, 2);
  return o;
};

// saida so ASCII: nome de arquivo ou assunto de commit pode ter acento
const ascii = (s) => String(s).replace(/[^\x20-\x7e\n]/g, '?');
const dizer = (s) => console.log(ascii(s));

// fsmonitor off: o config da pista nao pode fazer o git rodar programa
const rodarGit = (cwd, args) => spawnSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.quotepath=off', '-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const git = (cwd, ...args) => {
  const r = rodarGit(cwd, args);
  if (r.status !== 0) throw new Error(`git ${args[0]} falhou: ${(r.stderr || r.error?.message || '').trim()}`);
  return r.stdout.trim();
};
const tenta = (cwd, ...args) => {
  const r = rodarGit(cwd, args);
  return r.status === 0 ? r.stdout.trim() : null;
};

const norm = (p) => {
  let r = p;
  try {
    r = realpathSync(p);
  } catch {
    // caminho que nao existe mais: compara pelo texto
  }
  r = path.resolve(r);
  return process.platform === 'win32' ? r.toLowerCase() : r;
};

const lerWorktrees = (repo) =>
  git(repo, 'worktree', 'list', '--porcelain')
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((bloco, i) => {
      const w = { principal: i === 0, branch: null, caminho: '' };
      for (const l of bloco.split(/\r?\n/)) {
        if (l.startsWith('worktree ')) w.caminho = l.slice(9);
        else if (l.startsWith('branch refs/heads/')) w.branch = l.slice(18);
      }
      return w;
    });

// soma de lstat().size sem seguir link: o link conta 0, o alvo nunca entra
const tamanho = (p) => {
  const st = lstatSync(p, { throwIfNoEntry: false });
  if (!st || st.isSymbolicLink()) return 0;
  if (!st.isDirectory()) return st.size;
  return readdirSync(p).reduce((s, n) => s + tamanho(path.join(p, n)), 0);
};

// ids com trava viva (mesma regra de vencimento do lib/trava.mjs, so leitura)
const idsEmUso = (raiz) => {
  const dir = path.join(raiz, '_despacho', '_trava');
  if (!existsSync(dir)) return [];
  const ids = [];
  for (const n of readdirSync(dir).filter((x) => x.endsWith('.lock'))) {
    try {
      const t = JSON.parse(readFileSync(path.join(dir, n), 'utf8'));
      if (Date.now() - t.inicio <= 2 * 60000 * t.minutos) ids.push(t.id);
    } catch {
      // ilegivel: dono morto, nao conta
    }
  }
  return ids;
};

const lerPistas = (repo, raiz, destino) => {
  const dir = path.join(raiz, 'pistas');
  if (!existsSync(dir)) return [];
  const wts = lerWorktrees(repo);
  const ativos = idsEmUso(raiz);
  const daRaiz = norm(repo);
  const pistas = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const caminho = path.join(dir, e.name);
    const w = wts.find((x) => norm(x.caminho) === norm(caminho));
    if (!e.isDirectory() || !w) continue;
    // sem trim: o status comeca com espaco (" M arquivo")
    const arquivos = (rodarGit(caminho, ['status', '--porcelain', '--untracked-files=all']).stdout ?? '')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''));
    const [hash = '-', data = '-'] = (tenta(caminho, 'log', '-1', '--format=%h%x09%cs') ?? '').split('\t');
    pistas.push({
      nome: e.name,
      caminho,
      branch: w.branch,
      principal: w.principal || norm(caminho) === daRaiz,
      hash,
      data,
      arquivos,
      comAgent: existsSync(path.join(caminho, '.agent')),
      emUso: ativos.some((id) => w.branch === `tarefa/${id}` || e.name === id),
      mesclada: !!w.branch && rodarGit(repo, ['merge-base', '--is-ancestor', `refs/heads/${w.branch}`, `refs/heads/${destino}`]).status === 0,
    });
  }
  return pistas;
};

// stdin fechado, vazio ou ilegivel = nao
const proximaLinha = pergunta;

// guarda a sujeira em <raiz>/_descartadas/<pista>-<hash>[-N]/; lanca se algo falhar
const salvarSujeira = (raiz, p) => {
  const dir = nomeLivre(path.join(raiz, '_descartadas', `${p.nome}-${p.hash}`), existsSync);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'mudancas.patch'), git(p.caminho, 'diff', 'HEAD'));
  writeFileSync(path.join(dir, 'status.txt'), git(p.caminho, 'status', '--porcelain', '--untracked-files=all'));
  writeFileSync(path.join(dir, 'ultimo-commit.txt'), git(p.caminho, 'log', '-1'));
  for (const f of sujeira(p.arquivos)) {
    const de = path.join(p.caminho, f);
    // so arquivo comum: apagado some, link nao e seguido
    if (!lstatSync(de, { throwIfNoEntry: false })?.isFile()) continue;
    const para = path.join(dir, 'arquivos', f);
    mkdirSync(path.dirname(para), { recursive: true });
    copyFileSync(de, para);
  }
};

const removerPista = (repo, p, falhas, forcar = false) => {
  // junction primeiro: se o git seguisse o link, o node_modules real iria junto
  for (const sub of PASTAS) {
    const nm = path.join(p.caminho, sub, 'node_modules');
    try {
      const r = removerJuncao(nm);
      if (r.removida && !r.alvoIntacto) {
        falhas.push(['JUNCAO_NAO_REMOVIDA', p.nome, `alvo de ${nm} nao confirmado`]);
        return false;
      }
    } catch (e) {
      falhas.push(['JUNCAO_NAO_REMOVIDA', p.nome, `${nm}: ${e.message}`]);
      return false;
    }
  }
  // --force so quando a sujeira ja foi salva (forcar)
  const remover = ['worktree', 'remove', ...(forcar ? ['--force'] : []), p.caminho];
  let r = rodarGit(repo, remover);
  if (r.status !== 0) {
    // so .agent/ e controle nao rastreado seguram o git: apaga so isso, sem --force
    rmSync(path.join(p.caminho, '.agent'), { recursive: true, force: true });
    for (const f of controleDoDispatch) rmSync(path.join(p.caminho, f), { force: true });
    r = rodarGit(repo, remover);
  }
  if (r.status !== 0) {
    falhas.push(['WORKTREE_NAO_REMOVIDA', p.nome, r.stderr.trim().split('\n')[0]]);
    return false;
  }
  return true;
};

const apagarBranch = (repo, p, falhas) => {
  const assunto = tenta(repo, 'log', '-1', '--format=%h %s', `refs/heads/${p.branch}`) ?? p.hash;
  const digitado = proximaLinha(`Isto apaga a branch ${p.branch} (ultimo commit ${assunto}). Digite o nome da pista para confirmar: `);
  if (digitado !== p.nome) {
    falhas.push(['NADA_CONFIRMADO', p.nome, `branch ${p.branch} mantida`]);
    return;
  }
  let r = rodarGit(repo, ['branch', '-d', p.branch]);
  if (r.status !== 0) {
    r = rodarGit(repo, ['branch', '-D', p.branch]);
    if (r.status === 0) dizer(`BRANCH_NAO_MESCLADA_APAGADA ${p.nome} ${p.branch} (ultimo commit ${assunto})`);
  }
  if (r.status !== 0) falhas.push(['BRANCH_NAO_APAGADA', p.nome, r.stderr.trim().split('\n')[0]]);
  else dizer(`branch ${p.branch} apagada`);
};

const principal = (argv) => {
  const o = lerArgs(argv);
  const repo = path.resolve(o.repo ?? git(path.dirname(fileURLToPath(import.meta.url)), 'rev-parse', '--show-toplevel'));
  if (!existsSync(repo)) throw new Falha('USO', `repositorio nao encontrado: ${repo}`, 2);
  const raiz = path.resolve(o.raiz);
  const destino = o.destino ?? 'main';
  const pistas = lerPistas(repo, raiz, destino);

  if (o.aplicar === undefined) {
    dizer(formatarLista(pistas, pistas.reduce((s, p) => s + tamanho(p.caminho), 0), raiz));
    return 0;
  }

  const falhas = [];
  for (const nome of ordemDeRemocao(o.aplicar.split(','))) {
    const p = pistas.find((x) => x.nome === nome);
    if (!p) {
      falhas.push(['PISTA_INEXISTENTE', nome, 'nao e uma pista de <raiz>/pistas']);
      continue;
    }
    const motivo = classificar({ pista: p, protegidas: PROTEGIDAS, arquivos: p.arquivos, emUso: p.emUso });
    const forcando = motivo === 'PISTA_SUJA' && o.forcar === true;
    if (motivo !== 'ok' && !forcando) {
      falhas.push([motivo, nome, motivo === 'PISTA_SUJA' ? sujeira(p.arquivos).join(', ') : motivo === 'PISTA_EM_USO' ? 'a trava tem a tarefa' : 'pista protegida']);
      continue;
    }
    if (!o.sim && !['s', 'S', 'sim'].includes(proximaLinha(`Remover a pista ${nome} (branch ${p.branch ?? 'solta'})? [s/N] `))) {
      falhas.push(['NADA_CONFIRMADO', nome, 'nada removido']);
      continue;
    }
    if (forcando) {
      try {
        salvarSujeira(raiz, p);
      } catch (e) {
        falhas.push(['SALVAMENTO_FALHOU', nome, e.message.split('\n')[0]]);
        continue;
      }
    }
    if (!removerPista(repo, p, falhas, forcando)) continue;
    dizer(`pista ${nome} removida (branch ${p.branch ?? 'solta'} mantida)`);
    if (o['apagar-branch'] && p.branch) apagarBranch(repo, p, falhas);
  }
  for (const [codigo, pista, motivo] of falhas) dizer(`${codigo} ${pista} ${motivo}`);
  return falhas.length ? 1 : 0;
};

try {
  process.exitCode = principal(process.argv.slice(2));
} catch (e) {
  if (e instanceof Falha) {
    console.error(ascii(`FALHA ${e.codigo} ${e.message}`));
    process.exitCode = e.saida;
  } else {
    console.error(ascii(`FALHA ERRO_INESPERADO ${e.stack ?? e}`));
    process.exitCode = 2;
  }
}

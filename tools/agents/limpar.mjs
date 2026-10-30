import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { decidir } from './lib/limpeza.mjs';
import { removerJuncao } from './lib/juncao.mjs';
import { pergunta } from './lib/pergunta.mjs';

class Falha extends Error {
  constructor(codigo, texto, saida) {
    super(texto);
    this.codigo = codigo;
    this.saida = saida;
  }
}

const COM_VALOR = ['--destino', '--repo', '--raiz', '--proteger', '--remoto'];
const SEM_VALOR = ['--aplicar', '--sim', '--remotas'];
const USO = 'uso: node tools/agents/limpar.mjs [--destino <branch>] [--repo <pasta>] [--raiz <pasta>] [--aplicar] [--sim] [--remotas] [--proteger <b1,b2,...>] [--remoto <nome>]';
const FIXAS = ['main', 'infra/m2', 'm3/prova', 'gh-pages'];
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
  return o;
};

// fsmonitor off: o config do repositorio nao pode fazer o git rodar programa
const rodarGit = (cwd, args) => spawnSync('git', ['-c', 'core.fsmonitor=false', '-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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
    // caminho que nao existe mais (worktree apagada a mao): compara pelo texto
  }
  r = path.resolve(r);
  return process.platform === 'win32' ? r.toLowerCase() : r;
};

const lerWorktrees = (repo) =>
  git(repo, 'worktree', 'list', '--porcelain')
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((bloco, i) => {
      const w = { principal: i === 0, travada: false, branch: null, caminho: '' };
      for (const l of bloco.split(/\r?\n/)) {
        if (l.startsWith('worktree ')) w.caminho = l.slice(9);
        else if (l.startsWith('branch refs/heads/')) w.branch = l.slice(18);
        else if (l === 'locked' || l.startsWith('locked ')) w.travada = true;
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

const acharOrfaos = (raiz, registradas) => {
  const dir = path.join(raiz, 'pistas');
  if (!existsSync(dir)) return [];
  const orfaos = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const pista = path.join(dir, e.name);
    if (!e.isDirectory() || registradas.has(norm(pista))) continue;
    for (const p of PASTAS) {
      const nm = path.join(pista, p, 'node_modules');
      const st = lstatSync(nm, { throwIfNoEntry: false });
      if (st) orfaos.push({ caminho: nm, link: st.isSymbolicLink(), bytes: tamanho(nm) });
    }
  }
  return orfaos;
};

const montarPlano = (o) => {
  const repo = path.resolve(o.repo ?? git(process.cwd(), 'rev-parse', '--show-toplevel'));
  if (!existsSync(repo)) throw new Falha('USO', `repositorio nao encontrado: ${repo}`, 2);
  const raiz = path.resolve(o.raiz ?? path.dirname(repo));
  const atual = tenta(repo, 'symbolic-ref', '--short', '-q', 'HEAD');
  const destino = o.destino ?? atual;
  if (!destino || tenta(repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${destino}`) === null) throw new Falha('USO', `destino inexistente: ${destino}`, 2);
  const remoto = o.remoto ?? 'origin';
  const lista = (...a) => git(repo, ...a).split(/\r?\n/).filter(Boolean);
  // lstrip e nao :short: com tag do mesmo nome o :short devolve "heads/x"
  const nomes = (extra, ref, strip) => lista('for-each-ref', ...extra, ref, `--format=%(refname:lstrip=${strip})`);
  const worktrees = lerWorktrees(repo);
  const fixas = worktrees.filter((w) => w.principal || w.travada || norm(w.caminho) === norm(repo));
  const decisao = decidir({
    branches: nomes([], 'refs/heads', 2),
    mescladas: nomes(['--merged', `refs/heads/${destino}`], 'refs/heads', 2),
    atual,
    destino,
    protegidas: [...FIXAS, ...(o.proteger?.split(',').map((s) => s.trim()).filter(Boolean) ?? [])],
    worktrees: fixas.map((w) => w.branch).filter(Boolean),
    tags: lista('tag', '--list'),
    // sem --remotas o remoto nem e consultado
    ...(o.remotas && {
      remotas: nomes([], `refs/remotes/${remoto}`, 3).filter((n) => n !== 'HEAD'),
      remotasMescladas: nomes(['--merged', `refs/heads/${destino}`], `refs/remotes/${remoto}`, 3).filter((n) => n !== 'HEAD'),
    }),
  });
  const wtSai = worktrees.filter((w) => !fixas.includes(w) && w.branch && decisao.remover.includes(w.branch));
  const orfaos = acharOrfaos(raiz, new Set(worktrees.map((w) => norm(w.caminho))));
  return {
    repo,
    remoto,
    locais: decisao.remover,
    worktrees: wtSai.map(({ caminho, branch }) => ({ caminho, branch })),
    orfaos,
    remotas: decisao.remover_remotas,
    protegidas: decisao.manter,
    bytes_a_liberar: wtSai.reduce((s, w) => s + tamanho(w.caminho), 0) + orfaos.reduce((s, x) => s + x.bytes, 0),
  };
};

const tabela = (p) =>
  [
    `branches locais a remover: ${p.locais.length} ${p.locais.join(', ')}`,
    `worktrees a remover: ${p.worktrees.length} ${p.worktrees.map((w) => w.caminho).join(', ')}`,
    `node_modules orfaos: ${p.orfaos.length} ${p.orfaos.map((x) => x.caminho).join(', ')}`,
    `branches remotas a apagar: ${p.remotas.length} ${p.remotas.join(', ')}`,
    `a liberar: ${p.bytes_a_liberar} bytes`,
  ].join('\n');

const worktreeSai = (repo, w, falhas) => {
  if (!existsSync(w.caminho)) return true; // o prune tira o registro
  const sujo = git(w.caminho, 'status', '--porcelain', '--untracked-files=all');
  if (sujo) {
    falhas.push({ alvo: w.caminho, motivo: 'WORKTREE_SUJA', detalhe: sujo.split('\n')[0] });
    return false;
  }
  // junction primeiro: se o git seguisse o link, o node_modules real iria junto
  for (const p of PASTAS) removerJuncao(path.join(w.caminho, p, 'node_modules'));
  const r = rodarGit(repo, ['worktree', 'remove', w.caminho]);
  if (r.status === 0) return true;
  falhas.push({ alvo: w.caminho, motivo: 'WORKTREE_NAO_REMOVIDA', detalhe: r.stderr.trim() });
  return false;
};

const aplicarLocais = (p, falhas) => {
  const naoSai = new Set();
  for (const w of p.worktrees) if (!worktreeSai(p.repo, w, falhas)) naoSai.add(w.branch);
  rodarGit(p.repo, ['worktree', 'prune']);
  for (const b of p.locais) {
    if (naoSai.has(b)) continue;
    // -d minusculo: o git recusa o que nao esta mesclado
    const r = rodarGit(p.repo, ['branch', '-d', b]);
    if (r.status !== 0) falhas.push({ alvo: b, motivo: 'RAMO_NAO_APAGADO', detalhe: r.stderr.trim() });
  }
  for (const x of p.orfaos) {
    try {
      if (x.link) {
        const r = removerJuncao(x.caminho);
        if (!r.removida) throw new Error(r.motivo);
      } else rmSync(x.caminho, { recursive: true });
    } catch (e) {
      falhas.push({ alvo: x.caminho, motivo: 'ORFAO_NAO_REMOVIDO', detalhe: e.message });
    }
  }
};

const aplicarRemotas = (p, falhas) => {
  for (const b of p.remotas) {
    const r = rodarGit(p.repo, ['push', p.remoto, '--delete', `refs/heads/${b}`]);
    if (r.status !== 0) falhas.push({ alvo: `${p.remoto}/${b}`, motivo: 'REMOTA_NAO_APAGADA', detalhe: r.stderr.trim() });
  }
};

const principal = (argv) => {
  const o = lerArgs(argv);
  const p = montarPlano(o);
  const saida = { locais: p.locais, worktrees: p.worktrees, orfaos: p.orfaos, remotas: p.remotas, protegidas: p.protegidas, bytes_a_liberar: p.bytes_a_liberar, aviso: null };
  console.error(tabela(p));
  if (!o.aplicar) {
    saida.aviso = 'somente leitura: use --aplicar para remover';
    console.log(JSON.stringify(saida, null, 2));
    return 0;
  }

  // stdin fechado, vazio ou ilegivel = nao
  const confirma = (texto) => ['s', 'S', 'sim'].includes(pergunta(texto));

  const falhas = [];
  const avisos = [];
  const temLocal = p.locais.length + p.worktrees.length + p.orfaos.length > 0;
  if (temLocal && !(o.sim || confirma('Remover? [s/N] '))) avisos.push('NADA_CONFIRMADO');
  else if (temLocal) aplicarLocais(p, falhas);
  // remotas tem confirmacao propria, mesmo com --sim
  if (o.remotas && p.remotas.length && !avisos.length) {
    if (confirma('Apagar branches remotas? [s/N] ')) aplicarRemotas(p, falhas);
    else avisos.push('NADA_CONFIRMADO (remotas)');
  }
  saida.aviso = avisos.join('; ') || null;
  saida.falhas = falhas;
  console.log(JSON.stringify(saida, null, 2));
  if (saida.aviso) console.error(saida.aviso);
  return falhas.length ? 1 : 0;
};

try {
  process.exitCode = principal(process.argv.slice(2));
} catch (e) {
  if (e instanceof Falha) {
    console.error(`FALHA ${e.codigo} ${e.message}`);
    process.exitCode = e.saida;
  } else {
    console.error(`FALHA ERRO_INESPERADO ${e.stack ?? e}`);
    process.exitCode = 2;
  }
}

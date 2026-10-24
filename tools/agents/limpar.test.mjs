import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const LIMPAR = aqui('./limpar.mjs');
const PS1 = aqui('./limpar.ps1');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const arquivo = (p, tam) => writeFileSync(p, 'x'.repeat(tam));

// Repositorio temporario na main (atual e destino), com: mesclada, nao mesclada, squash, homonima de tag,
// protegida, worktrees (mesclada, viva, fantasma), pistas orfas com node_modules e um remoto bare.
const ambiente = ({ worktrees = true, sujo = false } = {}) => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'limpar-'));
  const repo = path.join(tmp, 'repo');
  const raiz = path.join(tmp, 'raiz');
  const remoto = path.join(tmp, 'remoto.git');
  const fora = path.join(tmp, 'fora');
  for (const d of [repo, raiz, remoto, fora]) mkdirSync(d);
  git(remoto, 'init', '-q', '--bare');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 't');
  git(repo, 'config', 'user.email', 't@t');
  git(repo, 'remote', 'add', 'origin', remoto);
  writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  const nova = (nome, arq) => {
    git(repo, 'checkout', '-q', '-b', nome, base);
    writeFileSync(path.join(repo, arq), `${nome}\n`);
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', nome);
    git(repo, 'checkout', '-q', 'main');
  };
  for (const b of ['mesclada', 'v1', 'gh-pages', 'rem-mesclada']) git(repo, 'branch', b, base);
  git(repo, 'tag', 'v1', base);
  git(repo, 'tag', 'arquivo/velha', base);
  nova('nao-mesclada', 'n.txt');
  nova('squash', 's.txt');
  git(repo, 'merge', '--squash', 'squash');
  git(repo, 'commit', '-q', '-m', 'squash de squash');
  git(repo, 'push', '-q', 'origin', 'main', 'gh-pages', 'mesclada', 'rem-mesclada', 'nao-mesclada');
  git(repo, 'branch', '-q', '-D', 'rem-mesclada'); // so existe no remoto

  if (worktrees) {
    git(repo, 'branch', 'wt-mesclada', base);
    git(repo, 'worktree', 'add', '-q', path.join(raiz, 'pistas', 'wt-mesclada'), 'wt-mesclada');
    nova('wt-viva', 'v.txt');
    git(repo, 'worktree', 'add', '-q', path.join(raiz, 'pistas', 'wt-viva'), 'wt-viva');
    git(repo, 'branch', 'wt-fantasma', base);
    git(repo, 'worktree', 'add', '-q', path.join(raiz, 'pistas', 'wt-fantasma'), 'wt-fantasma');
    rmSync(path.join(raiz, 'pistas', 'wt-fantasma'), { recursive: true, force: true });
    if (sujo) {
      git(repo, 'branch', 'wt-sujo', base);
      git(repo, 'worktree', 'add', '-q', path.join(raiz, 'pistas', 'wt-sujo'), 'wt-sujo');
      writeFileSync(path.join(raiz, 'pistas', 'wt-sujo', 'lixo.txt'), 'lixo');
    }
  }
  // alvo fora do repositorio: nada disso pode ser apagado nem contado
  mkdirSync(path.join(fora, 'sub'));
  arquivo(path.join(fora, 'a.bin'), 1000);
  arquivo(path.join(fora, 'sub', 'b.bin'), 2000);
  const pistas = path.join(raiz, 'pistas');
  mkdirSync(path.join(pistas, 'orfa-link'), { recursive: true });
  symlinkSync(fora, path.join(pistas, 'orfa-link', 'node_modules'), 'junction');
  mkdirSync(path.join(pistas, 'orfa-pasta', 'node_modules', 'pkg'), { recursive: true });
  arquivo(path.join(pistas, 'orfa-pasta', 'node_modules', 'x.js'), 10);
  arquivo(path.join(pistas, 'orfa-pasta', 'node_modules', 'pkg', 'y.js'), 25);
  if (worktrees) symlinkSync(fora, path.join(pistas, 'wt-viva', 'node_modules'), 'junction');
  return { tmp, repo, raiz, remoto, fora, pistas };
};

const rodar = (e, args, input = '') => {
  const r = spawnSync(process.execPath, [LIMPAR, '--repo', e.repo, '--raiz', e.raiz, ...args], { encoding: 'utf8', input });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // saida que nao e JSON: o teste olha stdout
  }
  return { ...r, json };
};

const refs = (cwd) => git(cwd, 'for-each-ref', '--format=%(refname) %(objectname)');
const branches = (cwd) => git(cwd, 'for-each-ref', 'refs/heads', '--format=%(refname:lstrip=2)').split('\n').sort();
const worktrees = (cwd) => git(cwd, 'worktree', 'list', '--porcelain');
// arvore de pastas sem seguir link e sem o .git (o git do teste e quem muda ali, nao o limpar)
const arvore = (dir) => {
  const out = [];
  const anda = (d) => {
    for (const n of readdirSync(d).sort()) {
      if (n === '.git') continue;
      const p = path.join(d, n);
      const st = lstatSync(p);
      out.push(`${p}|${st.isSymbolicLink() ? `link:${readlinkSync(p)}` : st.isDirectory() ? 'dir' : st.size}`);
      if (st.isDirectory() && !st.isSymbolicLink()) anda(p);
    }
  };
  anda(dir);
  return out.join('\n');
};
const alvoIntacto = (fora) => assert.deepEqual(readdirSync(fora).sort(), ['a.bin', 'sub']) || assert.equal(readdirSync(path.join(fora, 'sub')).length, 1);

test('L2 sem --aplicar: lista em JSON, codigo 0 e nada muda', () => {
  const e = ambiente();
  const antes = [refs(e.repo), worktrees(e.repo), arvore(e.tmp)];
  const r = rodar(e, []);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.json, r.stdout);
  assert.ok(r.json.locais.includes('mesclada'));
  assert.deepEqual([refs(e.repo), worktrees(e.repo), arvore(e.tmp)], antes);
});

test('L3 --aplicar --sim: a mesclada some e o resto continua', () => {
  const e = ambiente();
  const tagsAntes = git(e.repo, 'tag', '--list');
  const r = rodar(e, ['--aplicar', '--sim']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(branches(e.repo), ['gh-pages', 'main', 'nao-mesclada', 'squash', 'v1', 'wt-viva']);
  assert.equal(git(e.repo, 'tag', '--list'), tagsAntes);
});

test('L3 --proteger soma-se a lista fixa', () => {
  const e = ambiente();
  const r = rodar(e, ['--aplicar', '--sim', '--proteger', 'mesclada']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(branches(e.repo).includes('mesclada'));
});

test('L4 worktree mesclada sai, a viva fica, a fantasma e podada', () => {
  const e = ambiente();
  const r = rodar(e, ['--aplicar', '--sim']);
  assert.equal(r.status, 0, r.stderr);
  const lista = worktrees(e.repo).toLowerCase();
  assert.ok(!lista.includes('wt-mesclada'));
  assert.ok(!lista.includes('wt-fantasma'));
  assert.ok(lista.includes('wt-viva'));
  assert.ok(!existsSync(path.join(e.pistas, 'wt-mesclada')));
  assert.ok(existsSync(path.join(e.pistas, 'wt-viva')));
});

test('L4 worktree com arquivo nao rastreado: falha nomeada, codigo 1 e as demais seguem', () => {
  const e = ambiente({ sujo: true });
  const r = rodar(e, ['--aplicar', '--sim']);
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.json.falhas.some((f) => f.motivo === 'WORKTREE_SUJA' && f.alvo.includes('wt-sujo')));
  assert.ok(branches(e.repo).includes('wt-sujo'));
  assert.ok(!branches(e.repo).includes('wt-mesclada'));
  assert.ok(!branches(e.repo).includes('mesclada'));
});

test('L5 node_modules orfao sai (link: so o link; pasta: a pasta); o de pista com worktree fica; o alvo intacto', () => {
  const e = ambiente();
  const r = rodar(e, ['--aplicar', '--sim']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!lstatSync(path.join(e.pistas, 'orfa-link', 'node_modules'), { throwIfNoEntry: false }));
  assert.ok(!existsSync(path.join(e.pistas, 'orfa-pasta', 'node_modules')));
  assert.ok(lstatSync(path.join(e.pistas, 'wt-viva', 'node_modules')).isSymbolicLink());
  alvoIntacto(e.fora);
});

test('L5 a worktree mesclada com junction sai sem apagar o alvo', () => {
  const e = ambiente();
  symlinkSync(e.fora, path.join(e.pistas, 'wt-mesclada', 'node_modules'), 'junction');
  const r = rodar(e, ['--aplicar', '--sim']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(path.join(e.pistas, 'wt-mesclada')));
  alvoIntacto(e.fora);
});

test('L6 bytes_a_liberar e a soma esperada, sem contar o alvo do link, e nao muda com link extra', () => {
  const e = ambiente({ worktrees: false });
  const esperado = 10 + 25; // so a pasta comum; o link da orfa-link conta 0
  assert.equal(rodar(e, []).json.bytes_a_liberar, esperado);
  const grande = path.join(e.tmp, 'grande');
  mkdirSync(grande);
  arquivo(path.join(grande, 'enorme.bin'), 50000);
  mkdirSync(path.join(e.pistas, 'orfa-extra'));
  symlinkSync(grande, path.join(e.pistas, 'orfa-extra', 'node_modules'), 'junction');
  assert.equal(rodar(e, []).json.bytes_a_liberar, esperado);
});

test('L7 stdin vazio: nada removido, codigo 0 e NADA_CONFIRMADO', () => {
  const e = ambiente();
  const antes = [refs(e.repo), worktrees(e.repo), arvore(e.tmp)];
  const r = rodar(e, ['--aplicar'], '');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout + r.stderr, /NADA_CONFIRMADO/);
  assert.deepEqual([refs(e.repo), worktrees(e.repo), arvore(e.tmp)], antes);
});

test('L7 stdin n e resposta fora de s/S/sim contam como nao; s remove', () => {
  const e = ambiente();
  for (const resposta of ['n\n', 'talvez\n', 'y\n', '\n']) {
    const r = rodar(e, ['--aplicar'], resposta);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(branches(e.repo).includes('mesclada'), `resposta ${JSON.stringify(resposta)}`);
  }
  const r = rodar(e, ['--aplicar'], 's\n');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!branches(e.repo).includes('mesclada'));
});

test('L8 sem --remotas o remoto nao e consultado nem tocado', () => {
  const e = ambiente();
  const antes = refs(e.remoto);
  const r = rodar(e, ['--aplicar', '--sim', '--remoto', 'inexistente']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json.remotas, []);
  assert.equal(refs(e.remoto), antes);
});

test('L8 --remotas --aplicar com confirmacao apaga so as mescladas e livres do bare', () => {
  const e = ambiente();
  const r = rodar(e, ['--aplicar', '--sim', '--remotas'], 's\n');
  assert.equal(r.status, 0, r.stderr);
  const restam = git(e.remoto, 'for-each-ref', 'refs/heads', '--format=%(refname:lstrip=2)').split('\n').sort();
  assert.deepEqual(restam, ['gh-pages', 'main', 'nao-mesclada']);
});

test('L8 --remotas com --sim ainda pede confirmacao propria das remotas', () => {
  const e = ambiente();
  const antes = refs(e.remoto);
  const r = rodar(e, ['--aplicar', '--sim', '--remotas'], '');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(refs(e.remoto), antes);
  assert.match(r.stdout + r.stderr, /NADA_CONFIRMADO/);
});

test('L9 limpar.ps1 tem exatamente as 4 linhas do contrato', () => {
  const texto = readFileSync(PS1, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(texto, "#requires -Version 7\n$ErrorActionPreference = 'Stop'\nnode \"$PSScriptRoot/limpar.mjs\" @args\nexit $LASTEXITCODE\n");
});

test('L9 pwsh -File limpar.ps1 --repo da codigo 0', (t) => {
  const achou = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' });
  if (achou.error || achou.status !== 0) return t.skip('pwsh nao encontrado');
  const e = ambiente();
  const r = spawnSync('pwsh', ['-NoProfile', '-File', PS1, '--repo', e.repo, '--raiz', e.raiz], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

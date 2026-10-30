import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adquirir } from './lib/trava.mjs';

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const DESCARTAR = aqui('./descartar.mjs');
const PS1 = aqui('./descartar.ps1');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// Repositorio temporario (main) com pistas reais: notebus-infra, a, b, c, suja, uso, agente (so .agent), jn (com junction)
const ambiente = () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'descartar-'));
  const repo = path.join(tmp, 'repo');
  const raiz = path.join(tmp, 'raiz');
  mkdirSync(path.join(repo, 'src'), { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 't');
  git(repo, 'config', 'user.email', 't@t');
  writeFileSync(path.join(repo, 'src', 'x.ts'), 'x\n');
  writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  const pista = (nome, branch) => git(repo, 'worktree', 'add', '-q', '-b', branch, path.join(raiz, 'pistas', nome));
  for (const [n, b] of [['notebus-infra', 'infra/m2'], ['a', 'tarefa/a'], ['b', 'tarefa/b'], ['c', 'tarefa/c'], ['suja', 'tarefa/suja'], ['uso', 'tarefa/uso'], ['agente', 'tarefa/agente'], ['jn', 'tarefa/jn']]) pista(n, b);
  const p = (n, ...r) => path.join(raiz, 'pistas', n, ...r);
  writeFileSync(p('suja', 'src', 'x.ts'), 'mudou\n');
  mkdirSync(p('agente', '.agent'));
  writeFileSync(p('agente', '.agent', 'report.json'), '{}');
  writeFileSync(p('agente', 'CONTROLE.tmp'), ''); // nao e controle: so .agent conta
  rmSync(p('agente', 'CONTROLE.tmp'));
  mkdirSync(p('a', '.agent'));
  const alvo = path.join(tmp, 'nm-real');
  mkdirSync(alvo);
  writeFileSync(path.join(alvo, 'pacote.txt'), 'dentro');
  symlinkSync(alvo, p('jn', 'node_modules'), 'junction');
  const trava = adquirir({ raiz, id: 'uso', minutos: 30, max: 5 });
  assert.ok(trava.ok);
  return { tmp, repo, raiz, p, alvo, limpar: () => rmSync(tmp, { recursive: true, force: true }) };
};

const rodar = (e, args, input = '') => spawnSync('node', [DESCARTAR, '--raiz', e.raiz, '--repo', e.repo, ...args], { encoding: 'utf8', input });
const saida = (r) => r.stdout + r.stderr;
const arvore = (e) => git(e.repo, 'worktree', 'list', '--porcelain') + readFileSync(path.join(e.repo, '.git', 'HEAD'), 'utf8');

test('D1 lista sem flag: colunas certas e nada muda', () => {
  const e = ambiente();
  const antes = arvore(e);
  const r = rodar(e, []);
  assert.equal(r.status, 0);
  const t = r.stdout;
  assert.match(t, /^a\n  branch: tarefa\/a\n  ultimo commit: [0-9a-f]+ \d{4}-\d\d-\d\d\n  com \.agent: sim\n  suja: nao\n  em uso: nao\n  mesclada: sim/m);
  assert.match(t, /^suja\n(.*\n){3}  suja: sim \(src\/x\.ts\)/m);
  assert.match(t, /^uso\n(.*\n){4}  em uso: sim/m);
  assert.match(t, /^b\n(.*\n){2}  com \.agent: nao/m);
  assert.match(t, /Para remover: descartar --raiz .* --aplicar <nome>\nBytes que liberaria/);
  assert.equal(arvore(e), antes);
  assert.ok(existsSync(e.p('a')) && existsSync(e.p('b')) && existsSync(e.p('suja')));
  e.limpar();
});

test('D2 remove so a nomeada; varias; nada sem --aplicar; inexistente nao impede as outras', () => {
  const e = ambiente();
  let r = rodar(e, ['--aplicar', 'b', '--sim']);
  assert.equal(r.status, 0);
  assert.ok(!existsSync(e.p('b')) && existsSync(e.p('a')) && existsSync(e.p('c')));
  r = rodar(e, ['--aplicar', 'a,c', '--sim']);
  assert.equal(r.status, 0);
  assert.ok(!existsSync(e.p('a')) && !existsSync(e.p('c')));
  rodar(e, ['--sim']);
  assert.ok(existsSync(e.p('agente')));
  r = rodar(e, ['--aplicar', 'fantasma,agente', '--sim']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^PISTA_INEXISTENTE fantasma /m);
  assert.ok(!existsSync(e.p('agente')));
  e.limpar();
});

test('D3 junction: alvo sobrevive; so .agent nao conta como sujeira', () => {
  const e = ambiente();
  const r = rodar(e, ['--aplicar', 'jn,agente,a', '--sim']);
  assert.equal(r.status, 0, saida(r));
  assert.ok(!existsSync(e.p('jn')) && !existsSync(e.p('agente')) && !existsSync(e.p('a')));
  assert.equal(readFileSync(path.join(e.alvo, 'pacote.txt'), 'utf8'), 'dentro');
  e.limpar();
});

test('D4 suja e em uso recusam antes da pergunta e nada e tocado', () => {
  const e = ambiente();
  const r = rodar(e, ['--aplicar', 'suja,uso']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^PISTA_SUJA suja src\/x\.ts$/m);
  assert.match(r.stdout, /^PISTA_EM_USO uso /m);
  assert.doesNotMatch(r.stderr, /Remover a pista/);
  assert.ok(existsSync(e.p('suja')) && existsSync(e.p('uso')));
  assert.equal(readFileSync(e.p('suja', 'src', 'x.ts'), 'utf8'), 'mudou\n');
  e.limpar();
});

test('D5 protegida, principal e caminho com .. nao saem', () => {
  const e = ambiente();
  for (const nome of ['notebus-infra', '..', '../repo', path.join('..', 'raiz', 'pistas', 'a'), e.repo]) {
    const r = rodar(e, ['--aplicar', nome, '--sim']);
    assert.equal(r.status, 1, nome);
    assert.match(r.stdout, /^(PISTA_PROTEGIDA|PISTA_INEXISTENTE) /m, nome);
  }
  assert.ok(existsSync(e.p('notebus-infra')) && existsSync(e.p('a')) && existsSync(path.join(e.repo, '.git')));
  e.limpar();
});

test('D6 branch e _despacho ficam; --apagar-branch com nome errado mantem, certo apaga e avisa', () => {
  const e = ambiente();
  mkdirSync(path.join(e.raiz, '_despacho', 'b'), { recursive: true });
  rodar(e, ['--aplicar', 'b', '--sim']);
  assert.match(git(e.repo, 'branch', '--list', 'tarefa/b'), /tarefa\/b/);
  assert.ok(existsSync(path.join(e.raiz, '_despacho', 'b')));
  let r = rodar(e, ['--aplicar', 'c', '--sim', '--apagar-branch'], 'errado\n');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^NADA_CONFIRMADO c /m);
  assert.match(git(e.repo, 'branch', '--list', 'tarefa/c'), /tarefa\/c/);
  // branch nao mesclada: um commit proprio
  writeFileSync(e.p('a', 'novo.txt'), 'n');
  git(e.p('a'), 'add', 'novo.txt');
  git(e.p('a'), 'commit', '-q', '-m', 'so da a');
  r = rodar(e, ['--aplicar', 'a', '--sim', '--apagar-branch'], 'a\n');
  assert.equal(r.status, 0, saida(r));
  assert.match(r.stdout, /BRANCH_NAO_MESCLADA_APAGADA a tarefa\/a/);
  assert.equal(git(e.repo, 'branch', '--list', 'tarefa/a'), '');
  e.limpar();
});

test('D7 sem entrada ou vazia: NADA_CONFIRMADO; s remove; --sim nao pula o nome da branch', () => {
  const e = ambiente();
  for (const input of ['', '\n', 'n\n']) {
    const r = rodar(e, ['--aplicar', 'a,b'], input);
    assert.equal(r.status, 1);
    assert.equal(r.stdout.match(/^NADA_CONFIRMADO /gm).length, 2);
    assert.ok(existsSync(e.p('a')) && existsSync(e.p('b')));
  }
  rodar(e, ['--aplicar', 'a'], 's\n');
  assert.ok(!existsSync(e.p('a')));
  const r = rodar(e, ['--aplicar', 'b', '--sim', '--apagar-branch']); // sem entrada: o nome nao vem
  assert.ok(!existsSync(e.p('b')));
  assert.match(r.stdout, /^NADA_CONFIRMADO b branch/m);
  assert.match(git(e.repo, 'branch', '--list', 'tarefa/b'), /tarefa\/b/);
  e.limpar();
});

test('D8 saida ASCII e descartar.ps1 e o chamador de 4 linhas', () => {
  const e = ambiente();
  writeFileSync(e.p('suja', 'acao-ç.txt'), 'x');
  const r = rodar(e, []);
  assert.doesNotMatch(saida(r), /[^\x00-\x7f]/);
  const rr = rodar(e, ['--aplicar', 'suja,zzç']);
  assert.doesNotMatch(saida(rr), /[^\x00-\x7f]/);
  assert.deepEqual(readFileSync(PS1, 'utf8').trim().split(/\r?\n/), ['#requires -Version 7', "$ErrorActionPreference = 'Stop'", 'node "$PSScriptRoot/descartar.mjs" @args', 'exit $LASTEXITCODE']);
  e.limpar();
});

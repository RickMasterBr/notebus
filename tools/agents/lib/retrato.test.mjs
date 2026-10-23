import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { retrato } from './retrato.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const repoTemp = () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'retrato-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 't');
  git(repo, 'config', 'user.email', 't@t');
  writeFileSync(path.join(repo, 'a.txt'), 'x\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
};

test('A2 retrato devolve os 4 campos e e deterministico', () => {
  const repo = repoTemp();
  const r = retrato({ repo });
  assert.match(r.repo_head, /^[0-9a-f]{40}$/);
  for (const k of ['repo_status_sha256', 'exclude_sha256', 'config_sha256']) assert.match(r[k], /^[0-9a-f]{64}$/, k);
  assert.deepEqual(Object.keys(r).sort(), ['config_sha256', 'exclude_sha256', 'repo_head', 'repo_status_sha256']);
  assert.deepEqual(retrato({ repo }), r);
  rmSync(repo, { recursive: true, force: true });
});

test('A2 retrato: arquivo nao rastreado, exclude e config mudam o hash certo', () => {
  const repo = repoTemp();
  const antes = retrato({ repo });
  writeFileSync(path.join(repo, 'novo.txt'), 'y');
  const b = retrato({ repo });
  assert.notEqual(b.repo_status_sha256, antes.repo_status_sha256);
  assert.equal(b.exclude_sha256, antes.exclude_sha256);

  const exclude = path.join(repo, '.git', 'info', 'exclude');
  writeFileSync(exclude, readFileSync(exclude, 'utf8') + 'zzz\n');
  const c = retrato({ repo });
  assert.notEqual(c.exclude_sha256, b.exclude_sha256);

  git(repo, 'config', '--local', 'x.y', 'z');
  assert.notEqual(retrato({ repo }).config_sha256, c.config_sha256);
  rmSync(repo, { recursive: true, force: true });
});

test('A2 retrato: exclude ausente vira o literal "ausente"', () => {
  const repo = repoTemp();
  rmSync(path.join(repo, '.git', 'info', 'exclude'), { force: true });
  const sha = retrato({ repo }).exclude_sha256;
  assert.equal(sha, execFileSync(process.execPath, ['-e', "process.stdout.write(require('crypto').createHash('sha256').update('ausente').digest('hex'))"], { encoding: 'utf8' }));
  rmSync(repo, { recursive: true, force: true });
});

test('A2 retrato: ignorados entram no status (--ignored=matching)', () => {
  const repo = repoTemp();
  writeFileSync(path.join(repo, '.gitignore'), 'lixo/\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'ignore');
  const antes = retrato({ repo });
  mkdirSync(path.join(repo, 'lixo'));
  writeFileSync(path.join(repo, 'lixo', 'f'), '1');
  assert.notEqual(retrato({ repo }).repo_status_sha256, antes.repo_status_sha256);
  rmSync(repo, { recursive: true, force: true });
});

test('A2 retrato: git injetado que lanca propaga o erro; modulo sem shell', () => {
  assert.throws(() => retrato({ repo: '.', git: () => { throw new Error('boom'); } }), /boom/);
  const fonte = readFileSync(new URL('./retrato.mjs', import.meta.url), 'utf8');
  assert.ok(!/shell\s*:\s*true/.test(fonte) && !/\bexec\(/.test(fonte));
  assert.match(fonte, /execFileSync/);
});

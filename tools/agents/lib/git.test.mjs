import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, parseZ, tenta } from './git.mjs';
import { criarRepo } from './gate-fixtures/repo-temporario.mjs';

const LIB = path.dirname(fileURLToPath(import.meta.url));

test('C12 git: comando de escrita e recusado antes de rodar', () => {
  const t = criarRepo();
  for (const a of [['add', '.'], ['commit', '-m', 'x'], ['checkout', 'main'], ['reset', '--hard'], ['clean', '-fd'], ['update-index', '--skip-worktree', 'a'], ['config', 'a.b', 'c']]) {
    assert.throws(() => git(t.pista, a), /GIT_COMANDO_PROIBIDO/, a.join(' '));
  }
  assert.match(git(t.pista, ['config', '--local', '--list']).toString(), /core\./);
  t.limpar();
});

test('C12 git: tenta separa saida 1 de erro de verdade', () => {
  const t = criarRepo();
  assert.equal(tenta(t.pista, ['merge-base', '--is-ancestor', t.base, 'HEAD']).ok, true);
  assert.equal(tenta(t.pista, ['rev-parse', '--verify', '--quiet', 'nao-existe']).ok, false);
  t.limpar();
});

test('C12 git: caminho com espaco e acento sai inteiro no -z', () => {
  const t = criarRepo();
  t.commitar({ 'src/alvo/ação com espaço.ts': 'x\n' });
  const nomes = parseZ(git(t.pista, ['diff', '--name-only', '-z', t.base, 'HEAD']));
  assert.deepEqual(nomes, ['src/alvo/ação com espaço.ts']);
  assert.deepEqual(parseZ(Buffer.from('')), []);
  t.limpar();
});

test('C12 fontes: sem shell, sem exec e sem verbo de escrita nos modulos do gate', () => {
  const arquivos = [path.join(LIB, 'git.mjs'), path.join(LIB, '..', 'gate.mjs'), ...readdirSync(path.join(LIB, 'gate')).filter((n) => !n.includes('.test.')).map((n) => path.join(LIB, 'gate', n))];
  assert.ok(arquivos.length >= 6);
  for (const f of arquivos) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /shell\s*:\s*true|(?<![.\w])exec\(|\bexecSync\(/, f);
    // verbo de escrita como argumento: so aparece na lista de recusa de git.mjs? nao, nem la
    assert.doesNotMatch(src, /['"](?:add|commit|checkout|reset|clean|update-index|push|rebase|stash|restore|switch|rm|mv)['"]/, f);
  }
});

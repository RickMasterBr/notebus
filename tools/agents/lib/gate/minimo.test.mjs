import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selecionar } from './minimo.mjs';

const TABELA = [
  { extensoes: ['.ts', '.tsx'], exceto: ['tools/agents/'], comandos: ['npm run typecheck'] },
  { prefixo: 'packages/domain/', comandos: ['npm test -w packages/domain'] },
  { prefixo: 'apps/mobile/', comandos: ['npm test -w apps/mobile', 'npx expo export'] },
  { prefixo: 'tools/agents/', comandos: ['node --test x'] },
];

test('X1 minimo: diff em packages/domain e apps/mobile da o minimo de cada prefixo na ordem da tabela', () => {
  const r = selecionar(['apps/mobile/src/a.tsx', 'packages/domain/b.ts'], TABELA, []);
  assert.deepEqual(r.map((x) => x.comando), ['npm run typecheck', 'npm test -w packages/domain', 'npm test -w apps/mobile', 'npx expo export']);
  assert.ok(r.every((x) => x.origem === 'minimo'));
});

test('X1 minimo: texto repetido entre minimo e contrato aparece uma vez, com origem minimo', () => {
  const r = selecionar(['packages/domain/b.ts'], TABELA, ['npm test -w packages/domain', 'git status --short', 'git status --short']);
  assert.deepEqual(r, [
    { comando: 'npm run typecheck', origem: 'minimo' },
    { comando: 'npm test -w packages/domain', origem: 'minimo' },
    { comando: 'git status --short', origem: 'contrato' },
  ]);
});

test('X1 minimo: diff vazio ou sem prefixo conhecido da so os do contrato; o contrato nunca remove o minimo', () => {
  assert.deepEqual(selecionar([], TABELA, ['a']), [{ comando: 'a', origem: 'contrato' }]);
  assert.deepEqual(selecionar(['README.md'], TABELA, ['a']), [{ comando: 'a', origem: 'contrato' }]);
  assert.deepEqual(selecionar(['packages/domain/b.ts'], TABELA, []).map((x) => x.comando), ['npm run typecheck', 'npm test -w packages/domain']);
});

test('X1 minimo: .ts em tools/agents/ nao pede typecheck (exceto); extensao em maiuscula casa', () => {
  assert.deepEqual(selecionar(['tools/agents/x.ts'], TABELA, []).map((x) => x.comando), ['node --test x']);
  assert.deepEqual(selecionar(['src/A.TS'], TABELA, []).map((x) => x.comando), ['npm run typecheck']);
});

test('X1 minimo: entrada nao e alterada', () => {
  const entradas = [['apps/mobile/a.ts'], TABELA, ['npm run typecheck', 'z']];
  const copia = structuredClone(entradas);
  selecionar(...entradas);
  assert.deepEqual(entradas, copia);
});

test('m3-i1 C2 gate.config: o expo export roda no workspace do app, nunca npx na raiz', () => {
  const { minimo_por_prefixo: tabela } = JSON.parse(readFileSync(new URL('../../gate.config.json', import.meta.url), 'utf8'));
  const todos = tabela.flatMap((l) => l.comandos);
  assert.ok(todos.every((c) => !/^npx expo export/.test(c)), 'npx expo export na raiz');
  const mobile = tabela.find((l) => l.prefixo === 'apps/mobile/');
  assert.ok(mobile.comandos.includes('npm exec -w apps/mobile -- expo export --platform ios --output-dir {saida}/dist'));
});

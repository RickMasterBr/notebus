import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { lerArgs, montar, UsoErro } from './contexto.mjs';
import { criarRepo, BRANCH } from '../gate-fixtures/repo-temporario.mjs';

test('C1 contexto: argumentos invalidos viram UsoErro', () => {
  const casos = [
    [[], 'sem contrato'],
    [['c.md', '--nao-existe'], 'flag desconhecida'],
    [['c.md', 'outro.md'], 'argumento a mais'],
    [['c.md', '--pista', 'p'], '--pista sem --relatorio'],
    [['c.md', '--pista', 'p', '--relatorio', 'r', '--branch', 'b'], '--pista sem --saida'],
    [['c.md', '--saida', 's'], '--saida sem --pista'],
    [['c.md', '--raiz'], 'flag sem valor'],
  ];
  for (const [argv, nome] of casos) assert.throws(() => lerArgs(argv), UsoErro, nome);
  assert.equal(lerArgs(['c.md', '--so-estatico', '--executar-sempre']).flags['--so-estatico'], true);
});

test('C1 contexto: contrato inexistente e base inexistente', () => {
  const t = criarRepo();
  t.pronto();
  assert.throws(() => montar([path.join(t.T, 'nao.md'), ...t.argv().slice(1)], { gatePath: t.contratoPath }), /nao encontrado/);
  assert.throws(() => t.ctx(['--base', 'f'.repeat(40)]), (e) => e instanceof UsoErro && e.codigo === 'BASE_INEXISTENTE');
  t.limpar();
});

test('C1 contexto: modo manual usa --pista e a base do contrato; despacho usa o plano', () => {
  const m = criarRepo();
  m.pronto();
  const cm = m.ctx();
  assert.deepEqual([cm.modo, cm.id, cm.branch, cm.base, cm.head === m.head(), cm.meta], ['manual', 't-teste', BRANCH, m.base, true, null]);
  assert.equal(cm.junctions.length, 6);
  m.limpar();
  const d = criarRepo({ modo: 'despacho' });
  d.pronto();
  const cd = d.ctx();
  assert.deepEqual([cd.modo, path.normalize(cd.pista), path.normalize(cd.relatorioPath), path.normalize(cd.saida)], ['despacho', path.normalize(d.pista), path.normalize(d.relatorioPath), path.normalize(d.dirDespacho)]);
  assert.equal(cd.meta.id, 't-teste');
  d.limpar();
});

test('C6 contexto: copiasHook aponta para as copias do despacho (mesmas do planejar)', () => {
  const t = criarRepo({ modo: 'despacho' });
  t.pronto();
  assert.deepEqual(t.ctx().copiasHook, {
    '.agents/hooks.json': path.join(t.dirDespacho, 'hooks-agy.json'),
    'opencode.json': path.join(t.dirDespacho, 'opencode-config.json'),
  });
  t.limpar();
});

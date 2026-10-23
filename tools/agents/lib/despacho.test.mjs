import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { planejar, montarPrompt } from './despacho.mjs';

const contrato = { id: 'tarefa-um', pista: 'minha-pista', base: { branch: 'infra/m2', commit: 'abc1234' }, limites: { turnos: 5, minutos: 5 } };
const dirs = { raiz: path.resolve('raiz-x'), repo: path.resolve('repo-x') };

test('P1 planejar: branch, pista, despachoDir e 6 juncoes', () => {
  const p = planejar(contrato, dirs);
  assert.equal(p.branch, 'tarefa/tarefa-um');
  assert.equal(p.base, 'abc1234');
  assert.equal(p.pista.caminho, path.join(dirs.raiz, 'pistas', 'minha-pista'));
  assert.equal(p.despachoDir, path.join(dirs.raiz, '_despacho', 'tarefa-um'));
  assert.equal(p.junctions.length, 6);
  assert.deepEqual(p.junctions[0], { de: path.join(dirs.repo, 'node_modules'), para: path.join(p.pista.caminho, 'node_modules') });
  assert.deepEqual(p.junctions[1], { de: path.join(dirs.repo, 'apps', 'mobile', 'node_modules'), para: path.join(p.pista.caminho, 'apps', 'mobile', 'node_modules') });
  assert.equal(p.junctions[5].para, path.join(p.pista.caminho, 'tools', 'mvp-report', 'node_modules'));
  for (const f of Object.values(p.arquivosDespacho)) assert.equal(path.dirname(f), p.despachoDir);
  assert.deepEqual(Object.keys(p.arquivosDespacho), ['autorizacao', 'schema', 'saida', 'stderr', 'relatorio', 'meta']);
});

test('P1 planejar: puro (repetivel, nao altera o contrato) e sem fs nem processo', () => {
  const copia = structuredClone(contrato);
  assert.deepEqual(planejar(contrato, dirs), planejar(contrato, dirs));
  assert.deepEqual(contrato, copia);
  const fonte = readFileSync(new URL('./despacho.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(fonte, /node:fs|node:child_process/);
});

test('P2 prompt: fixo, com id, contrato.md e regra de um comando', () => {
  const p = montarPrompt(contrato);
  for (const trecho of ['tarefa-um', '.agent/contrato.md', 'um comando por chamada', 'sem ;']) assert.ok(p.includes(trecho), trecho);
  assert.equal(p, montarPrompt(contrato));
  const outro = montarPrompt({ ...contrato, id: 'outra' });
  assert.notEqual(outro, p);
  assert.equal(outro.replaceAll('outra', 'tarefa-um'), p);
});

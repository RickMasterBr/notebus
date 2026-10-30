import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificar, formatarLista, ordemDeRemocao } from './descarte.mjs';

const pista = { nome: 'a', principal: false };

test('D4 classificar: protegida, em uso e suja nesta ordem; controle nao e sujeira', () => {
  assert.equal(classificar({ pista, protegidas: ['a'], emUso: true }), 'PISTA_PROTEGIDA');
  assert.equal(classificar({ pista: { ...pista, principal: true } }), 'PISTA_PROTEGIDA');
  assert.equal(classificar({ pista, emUso: true, arquivos: ['src/x.ts'] }), 'PISTA_EM_USO');
  assert.equal(classificar({ pista, arquivos: ['src/x.ts'] }), 'PISTA_SUJA');
  assert.equal(classificar({ pista, arquivos: ['.agent/', '.agent/report.json', 'node_modules', 'node_modules/'] }), 'ok');
});

test('D2 ordemDeRemocao tira vazios e repetidos', () => {
  assert.deepEqual(ordemDeRemocao(['b', ' a ', 'b', '']), ['b', 'a']);
});

test('D1 formatarLista mostra as colunas', () => {
  const t = formatarLista([{ nome: 'a', branch: 'tarefa/a', hash: 'abc', data: '2026-01-01', comAgent: true, arquivos: ['x'], emUso: false, mesclada: true }], 10, '/r');
  assert.match(t, /suja: sim \(x\)/);
  assert.match(t, /Para remover: descartar --raiz \/r --aplicar <nome>/);
});

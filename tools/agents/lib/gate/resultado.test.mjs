import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular, linha } from './resultado.mjs';

const v = (status, codigo = '', extra = {}) => ({ status, codigo, ...extra });

test('C11 resultado: falha reprova (1), mesmo com nao_rodou junto', () => {
  assert.deepEqual([calcular([v('ok'), v('falha', 'X')]).resultado, calcular([v('ok'), v('falha', 'X'), v('nao_rodou', 'P')]).codigo], ['reprovado', 1]);
});

test('C11 resultado: sem falha e com nao_rodou e inconclusivo (3)', () => {
  const r = calcular([v('ok'), v('nao_rodou', 'PENDENTE_C2')]);
  assert.deepEqual([r.resultado, r.codigo], ['inconclusivo', 3]);
});

test('C11 resultado: so ok e aviso aprova (0) e junta os avisos sem repetir', () => {
  const r = calcular([v('ok'), v('aviso', 'SEM_META'), v('aviso', 'SEM_META'), v('aviso', 'REFORMATADO')]);
  assert.deepEqual([r.resultado, r.codigo, r.avisos], ['aprovado', 0, ['SEM_META', 'REFORMATADO']]);
});

test('C11 resultado: nenhuma verificacao rodou nunca e aprovado', () => {
  for (const entrada of [[], [v('nao_rodou', 'P')], [v('aviso', 'A')]]) assert.equal(calcular(entrada).resultado, 'inconclusivo');
});

test('C11 resultado: exige_revisor vem de qualquer verificacao que o pede', () => {
  assert.equal(calcular([v('ok'), v('aviso', 'A', { exigeRevisor: true })]).exige_revisor, true);
  assert.equal(calcular([v('ok')]).exige_revisor, false);
});

test('C1 linha: uma linha por resultado', () => {
  const vs = [v('falha', 'A'), v('falha', 'B'), v('falha', 'A'), v('nao_rodou', 'P')];
  assert.equal(linha({ resultado: 'reprovado', id: 't', head: 'a'.repeat(40), verificacoes: vs }), 'REPROVADO t A,B');
  assert.equal(linha({ resultado: 'inconclusivo', id: 't', head: 'a'.repeat(40), verificacoes: vs }), 'INCONCLUSIVO t P');
  assert.equal(linha({ resultado: 'aprovado', id: 't', head: 'abcdef0123', verificacoes: [] }), 'APROVADO t abcdef0');
});

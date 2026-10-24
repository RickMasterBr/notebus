import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decidir } from './limpeza.mjs';

const entrada = () => ({
  branches: ['main', 'integ', 'protegida', 'v1', 'em-uso', 'nao-mesclada', 'livre', 'livre2'],
  mescladas: ['main', 'integ', 'protegida', 'v1', 'em-uso', 'livre', 'livre2'],
  atual: 'integ',
  destino: 'main',
  protegidas: ['protegida'],
  worktrees: ['em-uso'],
  tags: ['v1'],
  remotas: ['livre', 'nao-mesclada', 'protegida', 'v1', 'main'],
  remotasMescladas: ['livre', 'protegida', 'v1', 'main'],
});

test('L1 decidir: cada caso mantido com o motivo certo e so as mescladas livres saem', () => {
  const { remover, manter } = decidir(entrada());
  assert.deepEqual(remover, ['livre', 'livre2']);
  assert.deepEqual(Object.fromEntries(manter.map((m) => [m.nome, m.motivo])), {
    main: 'DESTINO',
    integ: 'ATUAL',
    protegida: 'PROTEGIDA',
    v1: 'TAG_HOMONIMA',
    'em-uso': 'EM_USO_POR_WORKTREE',
    'nao-mesclada': 'NAO_MESCLADA',
  });
});

test('L1 decidir: remotas so as mescladas e livres', () => {
  assert.deepEqual(decidir(entrada()).remover_remotas, ['livre']);
});

test('L1 decidir: entrada intacta e duas chamadas iguais', () => {
  const e = entrada();
  const copia = structuredClone(e);
  const a = decidir(e);
  assert.deepEqual(e, copia);
  assert.deepEqual(decidir(e), a);
});

test('L1 decidir: o modulo nao importa fs nem child_process', () => {
  const fonte = readFileSync(new URL('./limpeza.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(fonte, /^\s*import\b.*(node:fs|node:child_process|'fs'|'child_process')/m);
});

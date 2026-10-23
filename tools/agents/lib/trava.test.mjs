import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { adquirir } from './trava.mjs';

const nova = () => path.join(mkdtempSync(path.join(tmpdir(), 'trava-')), 'ainda-nao-existe');
const lista = (raiz) => readdirSync(path.join(raiz, '_despacho', '_trava'));

test('P3 trava: cheia, mesma tarefa, liberacao idempotente', () => {
  const raiz = nova();
  const a = adquirir({ raiz, id: 'a', minutos: 5, max: 2 });
  const b = adquirir({ raiz, id: 'b', minutos: 5, max: 2 });
  assert.ok(a.ok && b.ok);
  const c = adquirir({ raiz, id: 'c', minutos: 5, max: 2 });
  assert.equal(c.ok, false);
  assert.equal(c.codigo, 'TRAVA_CHEIA');
  assert.deepEqual(c.ativos.sort(), ['a', 'b']);
  assert.equal(adquirir({ raiz, id: 'a', minutos: 5, max: 3 }).codigo, 'JA_EM_ANDAMENTO');
  a.liberar();
  assert.doesNotThrow(() => a.liberar());
  assert.deepEqual(lista(raiz), ['b.lock']);
  assert.ok(adquirir({ raiz, id: 'c', minutos: 5, max: 2 }).ok);
  rmSync(path.dirname(raiz), { recursive: true });
});

test('P3 trava vencida (mais de 2*minutos) e removida e nao conta', () => {
  const raiz = nova();
  const velha = adquirir({ raiz, id: 'velha', minutos: 1, max: 1, agora: 0 });
  assert.ok(velha.ok);
  assert.equal(adquirir({ raiz, id: 'x', minutos: 1, max: 1, agora: 120000 }).codigo, 'TRAVA_CHEIA');
  assert.ok(adquirir({ raiz, id: 'x', minutos: 1, max: 1, agora: 120001 }).ok);
  assert.deepEqual(lista(raiz), ['x.lock']);
  assert.ok(!existsSync(path.join(raiz, '_despacho', '_trava', 'velha.lock')));
  rmSync(path.dirname(raiz), { recursive: true });
});

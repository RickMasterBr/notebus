import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('A4 corrida: arquivo criado por outro entre a listagem e a criacao nao e sobrescrito', () => {
  const raiz = nova();
  const alheio = JSON.stringify({ id: 'a', pid: 1, inicio: Date.now(), minutos: 5 });
  const r = adquirir({ raiz, id: 'a', minutos: 5, max: 2, antesDeCriar: (arq) => writeFileSync(arq, alheio) });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'JA_EM_ANDAMENTO');
  assert.equal(readFileSync(path.join(raiz, '_despacho', '_trava', 'a.lock'), 'utf8'), alheio);
  rmSync(path.dirname(raiz), { recursive: true });
});

test('A4 8 processos simultaneos no mesmo id com max 1: exatamente 1 ok (3 vezes)', async () => {
  const filho = path.join(mkdtempSync(path.join(tmpdir(), 'trava-f-')), 'filho.mjs');
  writeFileSync(filho, `import { adquirir } from ${JSON.stringify(new URL('./trava.mjs', import.meta.url).href)};
process.on('message', ({ raiz }) => {
  const r = adquirir({ raiz, id: 'mesmo', minutos: 5, max: 1 });
  process.send({ ok: r.ok }, () => process.exit(0));
});
`);
  for (let rodada = 0; rodada < 3; rodada++) {
    const raiz = nova();
    const filhos = Array.from({ length: 8 }, () => fork(filho));
    const resultados = await Promise.all(filhos.map((f) => new Promise((res) => { f.on('message', res); f.send({ raiz }); })));
    assert.equal(resultados.filter((r) => r.ok).length, 1, `rodada ${rodada}`);
    rmSync(path.dirname(raiz), { recursive: true });
  }
  rmSync(path.dirname(filho), { recursive: true });
});

test('A5 pasta propria: cria em _trava-gate e nao aparece em _trava', () => {
  const raiz = nova();
  const g = adquirir({ raiz, id: 'g', minutos: 5, max: 1, pasta: '_trava-gate' });
  assert.ok(g.ok);
  assert.ok(existsSync(path.join(raiz, '_despacho', '_trava-gate', 'g.lock')));
  const comum = adquirir({ raiz, id: 'c', minutos: 5, max: 1 });
  assert.ok(comum.ok);
  assert.deepEqual(lista(raiz), ['c.lock']);
  rmSync(path.dirname(raiz), { recursive: true });
});

test('A5 pasta invalida lanca TypeError PASTA_INVALIDA', () => {
  const raiz = nova();
  for (const pasta of ['../x', 'a/b', 'a\\b', '', '..']) {
    assert.throws(() => adquirir({ raiz, id: 'a', minutos: 5, max: 1, pasta }), (e) => e instanceof TypeError && e.code === 'PASTA_INVALIDA' && /PASTA_INVALIDA/.test(e.message), JSON.stringify(pasta));
  }
  rmSync(path.dirname(raiz), { recursive: true, force: true });
});

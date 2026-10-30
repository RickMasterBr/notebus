import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { adquirir, registrarSaida } from './trava.mjs';

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
// o filho so sai quando o teste manda 'sair': dono vivo nao perde a trava
process.on('message', (m) => {
  if (m.sair) return process.exit(0);
  const r = adquirir({ raiz: m.raiz, id: 'mesmo', minutos: 5, max: 1 });
  process.send({ ok: r.ok });
});
`);
  for (let rodada = 0; rodada < 3; rodada++) {
    const raiz = nova();
    const filhos = Array.from({ length: 8 }, () => fork(filho));
    const resultados = await Promise.all(filhos.map((f) => new Promise((res) => { f.on('message', res); f.send({ raiz }); })));
    for (const f of filhos) f.send({ sair: true });
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

const gravaTrava = (raiz, id, t) => {
  const dir = path.join(raiz, '_despacho', '_trava');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${id}.lock`), typeof t === 'string' ? t : JSON.stringify({ id, minutos: 5, ...t }));
};

test('V1 dono morto: trava com pid de processo que terminou e descartada na hora', () => {
  const raiz = nova();
  const pid = spawnSync(process.execPath, ['-e', '0']).pid;
  gravaTrava(raiz, 'a', { pid, inicio: Date.now() });
  const r = adquirir({ raiz, id: 'a', minutos: 5, max: 1 });
  assert.ok(r.ok);
  assert.equal(JSON.parse(readFileSync(path.join(raiz, '_despacho', '_trava', 'a.lock'), 'utf8')).pid, process.pid);
  rmSync(path.dirname(raiz), { recursive: true });
});

test('V2 dono vivo vale; ilegivel e vencida sao descartadas', () => {
  const raiz = nova();
  gravaTrava(raiz, 'a', { pid: process.pid, inicio: Date.now() });
  assert.equal(adquirir({ raiz, id: 'a', minutos: 5, max: 2 }).codigo, 'JA_EM_ANDAMENTO');
  gravaTrava(raiz, 'b', '{lixo');
  gravaTrava(raiz, 'c', { pid: process.pid, inicio: Date.now() - 2 * 60000 * 5 - 1 });
  assert.deepEqual(adquirir({ raiz, id: 'd', minutos: 5, max: 2 }).ok, true);
  assert.deepEqual(lista(raiz).sort(), ['a.lock', 'd.lock']);
  rmSync(path.dirname(raiz), { recursive: true });
});

test('V3 registrarSaida: SIGINT, SIGTERM e SIGHUP soltam a trava e saem com 130, 143 e 129; fim normal remove', () => {
  const emissor = new EventEmitter();
  const saidas = [];
  let liberou = 0;
  const liberar = (...args) => { assert.equal(args.length, 0); liberou++; };
  const soltar = registrarSaida(emissor, liberar, (c) => saidas.push(c));
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) emissor.emit(s);
  assert.deepEqual(saidas, [130, 143, 129]);
  assert.equal(liberou, 3);
  soltar();
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) assert.equal(emissor.listenerCount(s), 0);
});

test('A5 pasta invalida lanca TypeError PASTA_INVALIDA', () => {
  const raiz = nova();
  for (const pasta of ['../x', 'a/b', 'a\\b', '', '..']) {
    assert.throws(() => adquirir({ raiz, id: 'a', minutos: 5, max: 1, pasta }), (e) => e instanceof TypeError && e.code === 'PASTA_INVALIDA' && /PASTA_INVALIDA/.test(e.message), JSON.stringify(pasta));
  }
  rmSync(path.dirname(raiz), { recursive: true, force: true });
});

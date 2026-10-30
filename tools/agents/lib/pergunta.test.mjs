import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const PERGUNTA = new URL('./pergunta.mjs', import.meta.url).href;
// filho: faz duas perguntas e imprime as duas respostas em JSON no stdout
const CODIGO = `import { pergunta } from ${JSON.stringify(PERGUNTA)};
const a = pergunta('Q1? '); const b = pergunta('Q2? ');
console.log(JSON.stringify([a, b]));`;

const filho = () => spawn(process.execPath, ['--input-type=module', '-e', CODIGO], { stdio: ['pipe', 'pipe', 'pipe'] });
const rodarPipe = (input) => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', CODIGO], { encoding: 'utf8', input });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('P1 a pergunta aparece no stderr antes de qualquer byte de entrada, com a entrada aberta', async () => {
  const f = filho();
  let err = '';
  let out = '';
  f.stdout.on('data', (d) => (out += d));
  const espera = (marca) =>
    new Promise((ok) => {
      const ver = (d) => {
        err += d;
        if (err.includes(marca)) {
          f.stderr.off('data', ver);
          ok();
        }
      };
      ver('');
      f.stderr.on('data', ver);
    });
  const fim = new Promise((ok) => f.on('close', ok));
  await espera('Q1? '); // nenhum byte enviado ainda
  assert.equal(out, '');
  f.stdin.write('s\n');
  await espera('Q2? ');
  f.stdin.write('sim\n');
  await fim; // P2: conclui sem o teste fechar a entrada
  assert.deepEqual(JSON.parse(out), ['s', 'sim']);
});

test('P2 limpar e descartar usam lib/pergunta.mjs e nao leem mais o stdin inteiro', () => {
  for (const n of ['../limpar.mjs', '../descartar.mjs']) {
    const t = readFileSync(aqui(n), 'utf8');
    assert.match(t, /lib\/pergunta\.mjs/);
    assert.ok(!t.includes('readFileSync(0'));
  }
});

test('P3 pipe com varias linhas: cada pergunta consome uma linha, na ordem', () => {
  assert.deepEqual(rodarPipe('s\nsim\n'), ['s', 'sim']);
  assert.deepEqual(rodarPipe('um\r\ndois'), ['um', 'dois']);
});

test('P4 entrada vazia, so EOF ou linha em branco devolvem vazio (vale nao)', () => {
  assert.deepEqual(rodarPipe(''), ['', '']);
  assert.deepEqual(rodarPipe('\n\n'), ['', '']);
  assert.deepEqual(rodarPipe('n\n'), ['n', '']);
});

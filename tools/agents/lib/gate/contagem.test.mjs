import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { comContagem, contarChamadas, contarPuladas, lerTap, lerVitest, novosPorArquivo } from './contagem.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'gate-fixtures');
const ler = (n) => readFileSync(path.join(FIX, n), 'utf8');

test('X5 contagem: contarChamadas ignora linha comentada, conta it.each e nao conta regex.test( nem skip', () => {
  const t = [
    "it('a', () => {});",
    "// it('comentado', () => {});",
    "    // test('comentado', () => {});",
    "test('b', () => {});",
    "it.each([1, 2])('c', () => {});",
    "test.each([1])('d', () => {});",
    'if (EMAIL.test(x)) {}',
    "it.skip('pulado', () => {});",
    "test.only('so', () => {});",
    "xit('x', () => {});",
  ].join('\n');
  assert.equal(contarChamadas(t), 4);
  assert.equal(contarPuladas(t), 3);
});

test('X5 contagem: novosPorArquivo so devolve a diferenca positiva; arquivo ausente na base conta tudo', () => {
  assert.deepEqual(novosPorArquivo({ a: 3, b: 5, c: 2 }, { a: 5, b: 5, c: 1, n: 4 }), { a: 2, n: 4 });
  assert.deepEqual(novosPorArquivo({}, {}), {});
});

test('X5 contagem: lerVitest com amostra real devolve total, passou, falhou e pulou (skipped + todo)', () => {
  const r = lerVitest(ler('vitest-amostra.json'), 'packages/domain');
  assert.deepEqual(r, { pacote: 'packages/domain', total: 4, passou: 1, falhou: 1, pulou: 2, arquivos_pulados: ['src/a.test.ts'] });
  assert.equal(lerVitest(JSON.parse(ler('vitest-amostra.json'))).pacote, undefined);
});

test('X5 contagem: lerTap com amostra real devolve total, passou, falhou e pulou (skipped + todo)', () => {
  assert.deepEqual(lerTap(ler('tap-amostra.txt')), { total: 4, passou: 1, falhou: 1, pulou: 2 });
});

test('X5 contagem: amostra malformada devolve erro RESULTADO_ILEGIVEL', () => {
  const casos = [() => lerVitest('{nao e json'), () => lerVitest({ numTotalTests: 'x' }), () => lerVitest({}), () => lerTap('sem resumo'), () => lerTap('# tests 3')];
  for (const f of casos) assert.throws(f, (e) => e.codigo === 'RESULTADO_ILEGIVEL');
});

test('X5 contagem: comContagem pede TAP so ao node --test e json so aos dois pacotes vitest conhecidos', () => {
  const nt = 'node --test "tools/agents/**/*.test.mjs"';
  assert.deepEqual(comContagem(nt, 'v.json'), { executar: 'node --test --test-reporter=tap "tools/agents/**/*.test.mjs"', leitor: 'tap', pacote: nt });
  assert.equal(comContagem('node --test --test-reporter=spec x', 'v.json').leitor, null);
  assert.deepEqual(comContagem('npm test -w packages/domain', 'v.json'), { executar: 'npm test -w packages/domain -- --reporter=json --outputFile=v.json', leitor: 'vitest', pacote: 'packages/domain' });
  assert.equal(comContagem('npm test -w tools/mvp-report', 'v.json').leitor, null);
  assert.equal(comContagem('git status --short', 'v.json').executar, 'git status --short');
});

test('m3-i2 C1 apps/mobile roda com --maxWorkers=2 e --testTimeout=20000', () => {
  assert.equal(comContagem('npm test -w apps/mobile', 'v.json').executar, 'npm test -w apps/mobile -- --reporter=json --outputFile=v.json --maxWorkers=2 --testTimeout=20000');
});

test('m3-i2 C2 packages/domain continua sem as flags', () => {
  assert.equal(comContagem('npm test -w packages/domain', 'v.json').executar, 'npm test -w packages/domain -- --reporter=json --outputFile=v.json');
});

test('m3-i2 C3 leitor e pacote do app iguais; comandos que nao casam voltam iguais', () => {
  const r = comContagem('npm test -w apps/mobile', 'v.json');
  assert.equal(r.leitor, 'vitest');
  assert.equal(r.pacote, 'apps/mobile');
  for (const c of ['npm test -w tools/licenses', 'npm run typecheck']) assert.equal(comContagem(c, 'v.json').executar, c);
});

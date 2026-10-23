import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('./validar.mjs', import.meta.url));
const fx = (n) => fileURLToPath(new URL(`./lib/fixtures/${n}`, import.meta.url));
const tmp = mkdtempSync(path.join(tmpdir(), 'validar-'));
const rodar = (...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
};
const escreve = (nome, texto) => {
  const f = path.join(tmp, nome);
  writeFileSync(f, texto);
  return f;
};
const CS = ['--schema', fx('contrato.schema.json')];
const RS = ['--schema', fx('relatorio.schema.json')];

test('C9 contrato valido: OK e codigo 0', () => {
  assert.deepEqual(rodar('contrato', fx('contrato-valido.md'), ...CS), { code: 0, out: 'OK', err: '' });
});

test('C9 contrato com erros: linhas caminho codigo mensagem e codigo 1', () => {
  const r = rodar('contrato', fx('sobreposicao.md'), ...CS);
  assert.equal(r.code, 1);
  const linhas = r.out.split('\n');
  assert.equal(linhas.length, 2);
  assert.match(linhas[0], /^\/arquivos_permitidos\/0 LISTAS_SE_SOBREPOEM \S/);
  assert.equal(rodar('contrato', fx('sem-cabecalho.md'), ...CS).code, 1);
});

test('C9 relatorio valido e invalido', () => {
  assert.deepEqual(rodar('relatorio', fx('relatorio-valido.json'), ...RS), { code: 0, out: 'OK', err: '' });
  const ruim = escreve('ruim.json', JSON.stringify({ tarefa: 'x' }));
  const r = rodar('relatorio', ruim, ...RS);
  assert.equal(r.code, 1);
  assert.match(r.out, /^\/branch required /m);
});

test('C9 uso errado, arquivo ou schema inexistente, JSON quebrado, schema nao suportado: codigo 2', () => {
  assert.equal(rodar().code, 2);
  assert.equal(rodar('outro', 'x').code, 2);
  assert.equal(rodar('contrato', path.join(tmp, 'nao-existe.md'), ...CS).code, 2);
  assert.equal(rodar('contrato', fx('contrato-valido.md'), '--schema', path.join(tmp, 'nao-existe.json')).code, 2);
  assert.equal(rodar('relatorio', escreve('quebrado.json', '{ "a": '), ...RS).code, 2);
  const s = escreve('s.json', JSON.stringify({ oneOf: [] }));
  const r = rodar('relatorio', fx('relatorio-valido.json'), '--schema', s);
  assert.equal(r.code, 2);
  assert.match(r.err, /oneOf/);
});

test('D5 tipo herdado do Object da codigo 2 sem TypeError', () => {
  for (const t of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    const r = rodar(t, fx('relatorio-valido.json'));
    assert.equal(r.code, 2, t);
    assert.match(r.err, /^argumentos invalidos/);
    assert.doesNotMatch(r.err, /TypeError/);
  }
});

test('D5 JSON com BOM: relatorio, --schema e schema do contrato', () => {
  const bom = (arq) => '﻿' + readFileSync(fx(arq), 'utf8');
  const rel = escreve('rel-bom.json', bom('relatorio-valido.json'));
  assert.deepEqual(rodar('relatorio', rel, ...RS), { code: 0, out: 'OK', err: '' });
  assert.deepEqual(rodar('relatorio', fx('relatorio-valido.json'), '--schema', escreve('rs-bom.json', bom('relatorio.schema.json'))), { code: 0, out: 'OK', err: '' });
  assert.deepEqual(rodar('contrato', fx('contrato-valido.md'), '--schema', escreve('cs-bom.json', bom('contrato.schema.json'))), { code: 0, out: 'OK', err: '' });
});

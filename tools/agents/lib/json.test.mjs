import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lerJson } from './json.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'json-'));
const grava = (nome, texto) => {
  const f = path.join(tmp, nome);
  writeFileSync(f, texto);
  return f;
};

test('D5 lerJson le com e sem BOM', () => {
  assert.deepEqual(lerJson(grava('a.json', '{"a":1}')), { a: 1 });
  assert.deepEqual(lerJson(grava('b.json', '﻿{"a":1}')), { a: 1 });
});

test('D5 lerJson deixa o erro de parse subir como esta', () => {
  let esperado;
  try {
    JSON.parse('{ "a": ');
  } catch (e) {
    esperado = e.message;
  }
  assert.throws(() => lerJson(grava('c.json', '{ "a": ')), { name: 'SyntaxError', message: esperado });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_DESPACHOS } from './trava.mjs';

const fonte = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\s+/g, ' ');

const ARQUIVOS = ['../dispatch.mjs', './predespacho.mjs', './rodar.mjs'];

test('MAX_DESPACHOS vale 3', () => {
  assert.equal(MAX_DESPACHOS, 3);
});

for (const rel of ARQUIVOS) {
  test(`${rel} le o limite de trava.mjs e nao tem numero proprio`, () => {
    const t = fonte(rel);
    assert.match(t, /import \{[^}]*\bMAX_DESPACHOS\b[^}]*\} from '[^']*trava\.mjs'/);
    assert.doesNotMatch(t, /\bmax\s*:\s*\d/);
    assert.doesNotMatch(t, /\bmax\s*\?\?\s*\d/); // so o ?? do limite (o.max ?? N); outros ?? 0 do arquivo sao legitimos
    assert.doesNotMatch(t, /\d\s+despachos em andamento/);
    assert.doesNotMatch(t, /MAX_WORKERS\b/);
  });
}

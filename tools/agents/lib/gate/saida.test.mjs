import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gravar } from './saida.mjs';

test('C11 saida: gate.json e uma copia igual em gate-historico, uma por rodada', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'saida-'));
  const g = (n) => ({ inicio: '2026-10-23T19:28:00.123Z', n });
  gravar(dir, g(1));
  gravar(dir, g(2)); // mesmo instante: nao pode sobrescrever
  const hist = readdirSync(path.join(dir, 'gate-historico')).sort();
  assert.equal(hist.length, 2);
  assert.ok(hist.every((n) => !n.includes(':')));
  const ultimo = hist.map((n) => readFileSync(path.join(dir, 'gate-historico', n), 'utf8')).find((t) => JSON.parse(t).n === 2);
  assert.equal(ultimo, readFileSync(path.join(dir, 'gate.json'), 'utf8'));
  rmSync(dir, { recursive: true, force: true });
});

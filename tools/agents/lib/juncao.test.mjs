import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { removerJuncao } from './juncao.mjs';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'juncao-'));

test('M6 removerJuncao tira o link e o alvo continua com o conteudo', () => {
  const t = tmp();
  const alvo = path.join(t, 'alvo');
  mkdirSync(alvo);
  writeFileSync(path.join(alvo, 'pacote.txt'), 'conteudo');
  const link = path.join(t, 'link');
  symlinkSync(alvo, link, 'junction');
  assert.equal(lstatSync(link).isSymbolicLink(), true);
  assert.deepEqual(removerJuncao(link), { removida: true, alvoIntacto: true });
  assert.equal(lstatSync(link, { throwIfNoEntry: false }), undefined);
  assert.equal(readFileSync(path.join(alvo, 'pacote.txt'), 'utf8'), 'conteudo');
  rmSync(t, { recursive: true, force: true });
});

test('M6 removerJuncao nao mexe em pasta comum nem em caminho que nao existe', () => {
  const t = tmp();
  const pasta = path.join(t, 'pasta');
  mkdirSync(pasta);
  writeFileSync(path.join(pasta, 'a.txt'), 'x');
  assert.deepEqual(removerJuncao(pasta), { removida: false, motivo: 'NAO_E_LINK' });
  assert.equal(existsSync(path.join(pasta, 'a.txt')), true);
  assert.deepEqual(removerJuncao(path.join(t, 'nada')), { removida: false, motivo: 'NAO_EXISTE' });
  rmSync(t, { recursive: true, force: true });
});

test('M6 removerJuncao com link quebrado remove o link e diz que o alvo nao esta intacto', () => {
  const t = tmp();
  const alvo = path.join(t, 'alvo');
  mkdirSync(alvo);
  const link = path.join(t, 'link');
  symlinkSync(alvo, link, 'junction');
  rmSync(alvo, { recursive: true });
  assert.deepEqual(removerJuncao(link), { removida: true, alvoIntacto: false });
  assert.equal(lstatSync(link, { throwIfNoEntry: false }), undefined);
  rmSync(t, { recursive: true, force: true });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verificar } from './agents-doc.mjs';

const fx = (n) => readFileSync(fileURLToPath(new URL(`./agents-fixtures/${n}`, import.meta.url)), 'utf8');
const BOM = fx('agents-bom.md');
const CLAUDE = fx('claude-bom.md');
const AREAS = ['packages/domain/', 'apps/mobile/src/sheets/StackedSheet.tsx', 'apps/mobile/src/sheets/stack.ts', 'apps/mobile/src/data/noDirectClock.test.ts', 'apps/mobile/src/db/schema.ts', 'apps/mobile/src/db/backup.ts'];
const sempre = () => true;
const rodar = (a = BOM, c = CLAUDE, o = {}) => verificar(a, c, { areas: AREAS, existe: sempre, ...o });
const codigos = (r) => r.map((x) => x.codigo);
const comLinhas = (n) => {
  const base = BOM.replace(/\n$/, '').split('\n');
  return [...base, ...Array(n - base.length).fill('')].join('\n') + '\n';
};

test('base: o agents-bom passa em tudo', () => assert.deepEqual(rodar(), []));

test('V1: 100 linhas passa, 101 dá AGENTS_GRANDE', () => {
  assert.deepEqual(codigos(rodar(comLinhas(100))), []);
  assert.deepEqual(codigos(rodar(comLinhas(101))), ['AGENTS_GRANDE']);
});

test('V2: CLAUDE.md só aceita a importação', () => {
  assert.deepEqual(rodar(BOM, '\n@AGENTS.md\n\n'), []);
  for (const c of ['@AGENTS.md\noutra\n', 'outro texto\n', '']) assert.deepEqual(codigos(rodar(BOM, c)), ['CLAUDE_FORA_DO_PADRAO']);
  assert.deepEqual(codigos(rodar(BOM, fx('claude-duas-linhas.md'))), ['CLAUDE_FORA_DO_PADRAO']);
});

test('V3: caminho inexistente, docs/ via existe, ignorados e existente', () => {
  const r = rodar(BOM, CLAUDE, { existe: (c) => c !== 'docs/MAPA.md' });
  assert.deepEqual(r.map((x) => [x.codigo, x.texto]), [['CAMINHO_INEXISTENTE', 'docs/MAPA.md']]);
  assert.deepEqual(codigos(rodar(fx('agents-caminho-ruim.md'), CLAUDE, { existe: (c) => c !== 'docs/nao-existe.md' })), ['CAMINHO_INEXISTENTE']);
  const ign = '## Regras de ouro\n1. a\n\n`docs/<tarefa>.md` `src/*.ts` `C:\\x\\y.md` `.agent/report.json` `pt-BR.ts`\n';
  assert.deepEqual(rodar(ign, CLAUDE, { areas: [], existe: () => false }), []);
});

test('V4: área faltando nomeada; barra invertida também casa', () => {
  const r = rodar(fx('agents-sem-area.md'));
  assert.deepEqual(r.map((x) => [x.codigo, x.texto]), [['AREA_FALTANDO', 'apps/mobile/src/data/noDirectClock.test.ts']]);
  assert.deepEqual(rodar(BOM.replace('packages/domain', 'packages\\domain')), []);
  assert.deepEqual(rodar(BOM, CLAUDE, { areas: ['packages\\domain\\'] }), []);
});

test('V5: sequência 1..n passa; buraco, repetição e início em 2 falham', () => {
  const cod = (a) => codigos(rodar(a));
  assert.deepEqual(cod(BOM), []);
  assert.deepEqual(cod(fx('agents-regras-buraco.md')), ['REGRAS_FORA_DE_ORDEM']);
  assert.deepEqual(cod(BOM.replace(/^2\. /m, '1. ')), ['REGRAS_FORA_DE_ORDEM']);
  const em2 = BOM.replace(/^(\d+)\. /gm, (_, n) => `${+n + 1}. `);
  assert.deepEqual(cod(em2), ['REGRAS_FORA_DE_ORDEM']);
});

test('V6: cada padrão proibido falha; a linha "Não leia" não', () => {
  assert.deepEqual(codigos(rodar(fx('agents-proibido.md'))), ['TEXTO_PROIBIDO']);
  for (const t of ['BOOT_START', 'Escreva no diário.', 'escreva no diario', 'atualize o BOOT', 'Leia o estado do projeto', 'veja estado_diario_v1.md']) {
    assert.deepEqual(codigos(rodar(`${BOM}${t}\n`)), ['TEXTO_PROIBIDO'], t);
  }
  assert.ok(BOM.includes('Não leia: `docs/estado_diario_v1.md`'));
  assert.deepEqual(rodar(), []);
});

test('V7: o módulo não importa node:fs', () => {
  assert.doesNotMatch(readFileSync(fileURLToPath(new URL('./agents-doc.mjs', import.meta.url)), 'utf8'), /node:fs|from 'fs'/);
});

test('G6 V4: área escrita com barra invertida no texto e na lista casa, sem AREA_FALTANDO', () => {
  const invertido = BOM.replaceAll('packages/domain', 'packages\\domain');
  assert.ok(invertido.includes('packages\\domain') && !invertido.includes('packages/domain'));
  const areas = AREAS.map((a) => a.replaceAll('/', '\\'));
  assert.ok(!codigos(rodar(invertido, CLAUDE, { areas })).includes('AREA_FALTANDO'));
});

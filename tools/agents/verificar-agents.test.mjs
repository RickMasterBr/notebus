import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const CLI = aqui('./verificar-agents.mjs');
const FX = aqui('./lib/agents-fixtures');
const AREAS = ['packages/domain/', 'apps/mobile/src/db/schema.ts', 'apps/mobile/src/db/backup.ts', 'apps/mobile/src/sheets/stack.ts', 'apps/mobile/src/sheets/StackedSheet.tsx', 'apps/mobile/src/data/noDirectClock.test.ts'];
// caminhos citados no agents-bom.md que o repositório inventado precisa ter ("/" no fim = pasta)
const CITADOS = ['DESIGN.md', 'tools/', 'apps/mobile', 'packages/domain', '.agents/agents/', 'docs/MAPA.md', 'docs/estado_diario_v1.md', 'docs/v1/infra/modelos/relatorio.schema.json', 'docs/v1/contingencia/LEIA-ME.md', 'docs/v1/regras/ambiente.md', 'docs/v1/regras/renderizacao.md', 'docs/v1/regras/logica-em-componente.md', 'docs/v0/fase-1-dominio.md', 'docs/v0/adr/ADR-0002-banco-local.md', 'docs/v0/fase-6/regressoes.md', 'docs/v0/estrategia-de-testes.md', 'docs/v0/ESTADO-ATUAL.md', 'docs/v0/diario.md', 'docs/v0/adr/', 'docs/v1/adr/', 'docs/referencias/'];

const montar = (agents = 'agents-bom.md', claude = 'claude-bom.md') => {
  const repo = mkdtempSync(path.join(tmpdir(), 'agents-'));
  cpSync(path.join(FX, agents), path.join(repo, 'AGENTS.md'));
  cpSync(path.join(FX, claude), path.join(repo, 'CLAUDE.md'));
  mkdirSync(path.join(repo, 'tools/agents/hooks'), { recursive: true });
  writeFileSync(path.join(repo, 'tools/agents/hooks/protected-paths.json'), JSON.stringify(AREAS));
  for (const c of CITADOS) {
    const p = path.join(repo, c);
    if (c.endsWith('/') || !path.extname(c)) mkdirSync(p, { recursive: true });
    else {
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, '');
    }
  }
  return repo;
};
const rodar = (...args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8' });

test('V7: zero achados dá "0 achados" e código 0', () => {
  const r = rodar('--repo', montar());
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout.trim(), '0 achados');
});

test('V7: achados dão uma linha cada, "N achados" e código 1', () => {
  const r = rodar('--repo', montar('agents-sem-area.md', 'claude-duas-linhas.md'));
  assert.equal(r.status, 1);
  assert.deepEqual(r.stdout.trim().split('\n'), [
    'V2 CLAUDE_FORA_DO_PADRAO o CLAUDE.md deve ter só a linha @AGENTS.md',
    'V4 AREA_FALTANDO apps/mobile/src/data/noDirectClock.test.ts',
    '2 achados',
  ]);
});

test('V3: docs/ resolve em --docs', () => {
  const vazio = mkdtempSync(path.join(tmpdir(), 'vazio-'));
  const r = rodar('--repo', montar(), '--docs', vazio);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /V3 CAMINHO_INEXISTENTE docs\/MAPA\.md/);
});

test('V7: flag desconhecida, valor ausente e arquivo ausente dão 2', () => {
  const repo = montar();
  assert.equal(rodar('--repo', repo, '--foo', 'x').status, 2);
  assert.equal(rodar('--repo').status, 2);
  assert.equal(rodar('--repo', repo, '--agents', path.join(repo, 'nao-existe.md')).status, 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decidir } from './protected-paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'protected-paths.mjs');
const AREAS = ['packages/domain/src/x.ts', 'apps/mobile/src/sheets/StackedSheet.tsx', 'apps/mobile/src/sheets/stack.ts', 'apps/mobile/src/data/noDirectClock.test.ts', 'apps/mobile/src/db/schema.ts', 'apps/mobile/src/db/backup.ts'];
const CONTROLE = ['.claude/settings.local.json', '.agents/hooks.json', 'opencode.json', 'qualquer/pasta/autorizacao.json', 'tools/agents/hooks/protected-paths.mjs'];

const tmp = () => mkdtempSync(path.join(tmpdir(), 'm2a-'));
const mkRoot = () => {
  const r = tmp();
  writeFileSync(path.join(r, '.git'), 'gitdir: x');
  return r;
};
const mkAuth = (permitido) => {
  const f = path.join(tmp(), 'autorizacao.json');
  writeFileSync(f, JSON.stringify({ permitido }));
  return f;
};
const claudeEdit = (root, file) => ({ cwd: root, tool_name: 'Write', tool_input: { file_path: file } });
const claudeBash = (root, command, cwd = root) => ({ cwd, tool_name: 'Bash', tool_input: { command } });
const agyEdit = (root, file) => ({ workspacePaths: [root], toolCall: { name: 'write_to_file', args: { TargetFile: file } } });
const agyCmd = (root, CommandLine, Cwd = root) => ({ workspacePaths: [root], toolCall: { name: 'run_command', args: { CommandLine, Cwd } } });
const nega = (i, o) => decidir(i, o).negar === true;
const passa = (i, o) => decidir(i, o).negar === false;

// criterio 1
test('1: edicao livre passa (claude e agy)', () => {
  const r = mkRoot();
  assert.ok(passa(claudeEdit(r, path.join(r, 'apps/mobile/src/__spike__/x.test.ts'))));
  assert.ok(passa(agyEdit(r, path.join(r, 'apps', 'mobile', 'src', '__spike__', 'x.test.ts'))));
});

// criterio 2
for (const item of AREAS) {
  test(`2: nega ${item} (claude e agy)`, () => {
    const r = mkRoot();
    const a = decidir(claudeEdit(r, path.join(r, item)));
    assert.equal(a.negar, true);
    assert.match(a.motivo, /^Area protegida: .*Esta tarefa nao tem autorizacao escrita\./);
    assert.ok(nega(agyEdit(r, path.join(r, item))));
  });
}
test('2: barra invertida, maiuscula trocada e caminho relativo negam', () => {
  const r = mkRoot();
  assert.ok(nega(claudeEdit(r, r + '\\PACKAGES\\Domain\\src\\x.ts')));
  assert.ok(nega(agyEdit(r, r + '\\Apps\\Mobile\\SRC\\DB\\Schema.ts')));
  assert.ok(nega(claudeEdit(r, 'Packages/DOMAIN/src/x.ts')));
});

// criterio 3
for (const item of CONTROLE) {
  test(`3: arquivo de controle ${item} nega mesmo com autorizacao`, () => {
    const r = mkRoot();
    const auth = mkAuth([item, path.dirname(item) + '/', 'tools/agents/hooks/']);
    assert.ok(nega(claudeEdit(r, path.join(r, item)), { autorizacao: auth }));
    assert.ok(nega(agyEdit(r, path.join(r, item)), { autorizacao: auth }));
  });
}
test('3: terminal em arquivo de controle nega, com autorizacao tambem', () => {
  const r = mkRoot();
  const auth = mkAuth(['.agents/hooks.json']);
  assert.ok(nega(claudeBash(r, 'echo {} > .agents/hooks.json'), { autorizacao: auth }));
  assert.ok(nega(agyCmd(r, 'New-Item opencode.json'), { autorizacao: auth }));
});

// criterio 4
test('4: autorizacao libera a area listada e so ela', () => {
  const r = mkRoot();
  const auth = mkAuth(['packages/domain/']);
  assert.ok(passa(claudeEdit(r, path.join(r, 'packages/domain/src/x.ts')), { autorizacao: auth }));
  assert.ok(passa(agyEdit(r, path.join(r, 'packages/domain/src/x.ts')), { autorizacao: auth }));
  assert.ok(nega(claudeEdit(r, path.join(r, 'apps/mobile/src/db/schema.ts')), { autorizacao: auth }));
  assert.ok(passa(claudeBash(r, 'echo oi > packages/domain/x.ts'), { autorizacao: auth }));
});
test('4: autorizacao ausente, ilegivel ou quebrada nao libera nada', () => {
  const r = mkRoot();
  const quebrado = path.join(tmp(), 'autorizacao.json');
  writeFileSync(quebrado, '{quebrado');
  for (const autorizacao of [path.join(tmp(), 'nao-existe.json'), tmp(), quebrado]) {
    assert.ok(nega(claudeEdit(r, path.join(r, 'packages/domain/src/x.ts')), { autorizacao }));
  }
});

// criterio 5
test('5: terminal, leitura passa', () => {
  const r = mkRoot();
  for (const c of ['git diff packages/domain', 'Get-Content packages/domain/src/a.ts', 'ls packages/domain', 'npx vitest run packages/domain/src/a.test.ts']) {
    assert.ok(passa(claudeBash(r, c)), c);
    assert.ok(passa(agyCmd(r, c)), c);
  }
});

// criterio 6
test('6: terminal, escrita nega', () => {
  const r = mkRoot();
  for (const c of [
    'New-Item packages/domain/x.ts',
    'mkdir packages/domain/novo',
    `node -e "require('fs').writeFileSync('packages/domain/x.ts','')"`,
    'echo a > packages/domain/x.ts',
    'git diff packages/domain --output=packages/domain/a.patch',
    'git diff packages/domain > packages/domain/a.patch',
  ]) {
    assert.ok(nega(claudeBash(r, c)), c);
    assert.ok(nega(agyCmd(r, c)), c);
  }
});

// criterio 7
test('7: terminal composto', () => {
  const r = mkRoot();
  assert.ok(nega(claudeBash(r, 'git diff packages/domain; New-Item packages/domain/x.ts')));
  assert.ok(passa(claudeBash(r, 'git status && git diff packages/domain')));
});

// criterio 8
test('8: Cwd em area: escrita nega sem citar, leitura listada passa', () => {
  const r = mkRoot();
  const cwd = path.join(r, 'packages/domain');
  assert.ok(nega(agyCmd(r, 'rm src/x.ts', cwd)));
  assert.ok(nega(claudeBash(r, 'New-Item src/x.ts', cwd)));
  assert.ok(passa(agyCmd(r, 'git status', cwd)));
  assert.ok(passa(claudeBash(r, 'ls src', cwd)));
});

// criterio 9
test('9: nao bloqueia o resto', () => {
  const r = mkRoot();
  assert.ok(passa(claudeBash(r, 'npm run typecheck')));
  assert.ok(passa(claudeBash(r, 'New-Item apps/mobile/src/x.ts')));
});

// criterio 10
const run = (harness, input, ...extra) => spawnSync('node', [SCRIPT, harness, ...extra], { input, encoding: 'utf8' });
const FALHOU = /Hook de area protegida falhou/;
test('10: falha fechada (entrada quebrada, sem cwd, --areas inexistente)', () => {
  assert.match(JSON.parse(run('claude', '{quebrado').stdout).hookSpecificOutput.permissionDecisionReason, FALHOU);
  assert.match(JSON.parse(run('agy', '{quebrado').stdout).reason, FALHOU);
  assert.match(JSON.parse(run('claude', '{}').stdout).hookSpecificOutput.permissionDecisionReason, FALHOU);
  const r = mkRoot();
  const semAreas = run('agy', JSON.stringify(agyEdit(r, path.join(r, 'a.ts'))), '--areas', path.join(r, 'nao-existe.json'));
  assert.match(JSON.parse(semAreas.stdout).reason, FALHOU);
});

// criterio 11: formato das entradas reais do SPK-08 (campo raw), com a raiz trocada por uma pista temporaria
const CLAUDE_REAL = (root, file) => JSON.stringify({ session_id: '0a87555c', cwd: root, permission_mode: 'default', hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: file, content: 'x' }, tool_use_id: 'toolu_01' });
const AGY_REAL = (root, file) => JSON.stringify({ conversationId: '3248', modelName: 'gemini-4-argon-medium', stepIdx: 2, toolCall: { args: { CodeContent: 'x', Overwrite: true, TargetFile: file, toolAction: 'Creating', toolSummary: 'Create' }, name: 'write_to_file' }, workspacePaths: [root.replace(/\\/g, '/')] });
test('11: claude pela linha de comando (permitir e negar)', () => {
  const r = mkRoot();
  const ok = run('claude', CLAUDE_REAL(r, path.join(r, 'apps/mobile/src/__spike__/livre.test.ts')));
  assert.equal(ok.stdout, '');
  assert.equal(ok.status, 0);
  const no = run('claude', CLAUDE_REAL(r, path.join(r, 'packages/domain/a.ts')));
  assert.equal(no.status, 0);
  assert.equal(JSON.parse(no.stdout).hookSpecificOutput.permissionDecision, 'deny');
});
test('11: agy pela linha de comando (permitir e negar)', () => {
  const r = mkRoot();
  const ok = run('agy', AGY_REAL(r, path.join(r, 'apps/mobile/src/__spike__/livre.test.ts')));
  assert.deepEqual(JSON.parse(ok.stdout), { decision: 'allow' });
  assert.equal(ok.status, 0);
  const no = run('agy', AGY_REAL(r, path.join(r, 'packages/domain/a.ts')));
  assert.equal(no.status, 0);
  assert.equal(JSON.parse(no.stdout).decision, 'deny');
});

// criterio 12
test('12: --log grava uma linha JSON por decisao; sem --log nada e gravado', () => {
  const r = mkRoot();
  const log = path.join(tmp(), 'hook.log');
  run('claude', CLAUDE_REAL(r, path.join(r, 'packages/domain/a.ts')), '--log', log);
  const linhas = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].harness, 'claude');
  assert.equal(linhas[0].tool, 'Write');
  assert.equal(linhas[0].decisao, 'negar');
  assert.ok(linhas[0].t && linhas[0].alvo);
  run('claude', CLAUDE_REAL(r, path.join(r, 'a.ts')));
  assert.equal(existsSync(path.join(process.cwd(), 'hook.log')), false);
});

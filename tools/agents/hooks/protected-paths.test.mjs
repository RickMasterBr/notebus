import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
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
test('2: barra invertida, maiuscula trocada e caminho relativo negam', { skip: process.platform !== 'win32' }, () => {
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

// criterio 11 (a2): entradas reais do SPK-08 (campo raw), so com a raiz da pista trocada por __RAIZ__
const fixture = (nome, root, file) =>
  JSON.parse(readFileSync(path.join(HERE, 'fixtures', nome), 'utf8'), (k, v) => (typeof v === 'string' ? v.replaceAll('__RAIZ__', root) : v));
const CLAUDE_REAL = (root, file) => {
  const o = fixture('entrada-claude.json', root);
  if (file) o.tool_input.file_path = file;
  return JSON.stringify(o);
};
const AGY_REAL = (root, file) => {
  const o = fixture('entrada-agy.json', root);
  if (file) o.toolCall.args.TargetFile = file;
  return JSON.stringify(o);
};
test('11: claude pela linha de comando (permitir e negar)', () => {
  const r = mkRoot();
  const ok = run('claude', CLAUDE_REAL(r));
  assert.equal(ok.stdout, '');
  assert.equal(ok.status, 0);
  const no = run('claude', CLAUDE_REAL(r, path.join(r, 'packages/domain/a.ts')));
  assert.equal(no.status, 0);
  assert.equal(JSON.parse(no.stdout).hookSpecificOutput.permissionDecision, 'deny');
});
test('11: agy pela linha de comando (permitir e negar)', () => {
  const r = mkRoot();
  const ok = run('agy', AGY_REAL(r));
  assert.deepEqual(JSON.parse(ok.stdout), { decision: 'allow' });
  assert.equal(ok.status, 0);
  const no = run('agy', AGY_REAL(r, path.join(r, 'packages/domain/a.ts')));
  assert.equal(no.status, 0);
  assert.equal(JSON.parse(no.stdout).decision, 'deny');
});
test('11: fixtures usam __RAIZ__ no lugar da pista', () => {
  for (const nome of ['entrada-claude.json', 'entrada-agy.json']) {
    const t = readFileSync(path.join(HERE, 'fixtures', nome), 'utf8');
    assert.ok(t.includes('__RAIZ__'), nome);
    assert.ok(!/spk08-(claude|agy)/.test(t.replaceAll('C--Users-User-Desktop-Projetos-NoteBus-pistas-spk08-claude', '')), nome);
  }
});

// criterio 12
const lista = (d) => readdirSync(d).sort().join('|');
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
  const vazio = tmp();
  const antes = [lista(vazio), lista(HERE)];
  spawnSync('node', [SCRIPT, 'claude'], { input: CLAUDE_REAL(r, path.join(r, 'packages/domain/a.ts')), cwd: vazio, encoding: 'utf8' });
  assert.deepEqual([lista(vazio), lista(HERE)], antes);
});

// a2, R3
test('a2 R3: redirecionamento inofensivo passa, outro > continua negando', () => {
  const r = mkRoot();
  for (const c of ['npx vitest run packages/domain/src/a.test.ts 2>&1', 'git diff packages/domain 2>$null', 'git log packages/domain 2>&1 | Select-String x', 'git diff packages/domain 2>NUL']) {
    assert.ok(passa(claudeBash(r, c)), c);
  }
  for (const c of ['git diff packages/domain > fora.patch', 'echo a 2>&1 > packages/domain/x.ts']) assert.ok(nega(claudeBash(r, c)), c);
});

// a2, R1
test('a2 R1: vitest com -u, --update ou --outputFile nega', () => {
  const r = mkRoot();
  for (const c of ['npx vitest run packages/domain -u', 'npx vitest run packages/domain --update', 'npx vitest run packages/domain --outputFile=packages/domain/r.json']) {
    assert.ok(nega(claudeBash(r, c)), c);
  }
  assert.ok(passa(claudeBash(r, 'npx vitest run packages/domain/src/a.test.ts')));
});

// a2, R2
test('a2 R2: tsc so e leitura com --noEmit e sem flag que emite', () => {
  const r = mkRoot();
  for (const c of ['npx tsc -p packages/domain', 'npx tsc --noEmit -b packages/domain', 'npx tsc --noEmit -p packages/domain --outDir packages/domain/dist']) {
    assert.ok(nega(claudeBash(r, c)), c);
  }
  assert.ok(passa(claudeBash(r, 'npx tsc --noEmit -p packages/domain')));
});

// a2, R4
test('a2 R4: curinga que alcanca area nega', () => {
  const r = mkRoot();
  for (const c of ['Remove-Item pack*/domain/src/a.ts', 'Remove-Item pack*', 'Remove-Item *']) assert.ok(nega(claudeBash(r, c)), c);
  assert.ok(nega(claudeBash(r, 'Remove-Item src/db/sch*.ts', path.join(r, 'apps/mobile'))));
  assert.ok(nega(agyCmd(r, 'Remove-Item pack*')));
});
test('a2 R4: curinga fora do alcance, leitura e area autorizada passam', () => {
  const r = mkRoot();
  assert.ok(passa(claudeBash(r, 'ls pack*')));
  assert.ok(passa(claudeBash(r, 'Remove-Item *.log')));
  assert.ok(passa(claudeBash(r, 'Remove-Item src/d*/x', path.join(r, 'apps/mobile'))));
  assert.ok(passa(claudeBash(r, 'Remove-Item pack*'), { autorizacao: mkAuth(['packages/domain/']) }));
});

// a2, limites conhecidos
test('limites conhecidos (nao sao garantia)', () => {
  const lista = JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'bypass-conhecidos.json'), 'utf8'));
  assert.equal(lista.length, 6);
  const r = mkRoot();
  for (const item of lista) {
    assert.deepEqual(Object.keys(item).sort(), ['comando', 'cwd', 'por_que_passa', 'quem_fecha']);
    assert.ok(passa(claudeBash(r, item.comando, path.resolve(r, item.cwd))), item.comando);
  }
});

// a3
test('a3 criterio 1: caminho resolvido (., .., barras, aspas, curinga, valor de flag) nega com Cwd na raiz', () => {
  const r = mkRoot();
  for (const c of [
    'New-Item packages/./domain/x.ts',
    'New-Item packages/x/../domain/x.ts',
    'New-Item packages\\.\\domain\\x.ts',
    'New-Item "packages/domain/x.ts"',
    "New-Item 'packages\\domain\\x.ts'",
    "Remove-Item 'pack*/domain/a.ts'",
    'Remove-Item "pack*/domain/a.ts"',
    'Remove-Item -Path:pack*/domain/a.ts',
    'Remove-Item -LiteralPath:packages/./domain/a.ts',
    'rm --file=pack*/domain/a.ts',
  ]) {
    assert.ok(nega(claudeBash(r, c)), c);
  }
});
test('a3 criterio 2: com Cwd em apps/mobile, caminho relativo a area nega', () => {
  const r = mkRoot();
  const cwd = path.join(r, 'apps/mobile');
  for (const c of ['Set-Content src/db/schema.ts a', 'Set-Content src/db/backup.ts a', 'Set-Content src/sheets/stack.ts a', 'Set-Content src/data/noDirectClock.test.ts a', 'Remove-Item ../../packages/domain/x.ts', 'Set-Content src/db/sch*.ts a']) {
    assert.ok(nega(claudeBash(r, c, cwd)), c);
    assert.ok(nega(agyCmd(r, c, cwd)), c);
  }
});
test('a3 criterio 3: com Cwd em apps/mobile, fora das areas e leitura passam', () => {
  const r = mkRoot();
  const cwd = path.join(r, 'apps/mobile');
  for (const c of ['Set-Content src/data/x.ts a', 'New-Item src/screens/x.ts', 'ls src/db/schema.ts', 'Get-Content src/db/schema.ts', 'git diff src/db/schema.ts']) {
    assert.ok(passa(claudeBash(r, c, cwd)), c);
  }
});
test('a3 criterio 4: outros comandos passam', () => {
  const r = mkRoot();
  assert.ok(passa(claudeBash(r, 'New-Item apps/mobile/src/data/novo.ts')));
  assert.ok(passa(claudeBash(r, 'git commit -m "mensagem"')));
  assert.ok(passa(claudeBash(r, 'Set-Content ../../../fora.txt a', path.join(r, 'apps/mobile'))));
  assert.ok(passa(claudeBash(r, 'npx vitest run packages/domain/src/a.test.ts')));
});
test('a3 criterio 5: Cwd fora da pista; curinga passa (nao alcanca a pista), literal nega (checagem por texto)', () => {
  const r = mkRoot();
  const fora = tmp();
  assert.ok(passa(agyCmd(r, 'Remove-Item pack*/domain/a.ts', fora)));
  assert.ok(nega(agyCmd(r, 'Remove-Item packages/domain/a.ts', fora)));
});
test('a3 criterio 6 (R8): edicao com . e .. resolve e nega, nos dois formatos', () => {
  const r = mkRoot();
  for (const f of ['packages/./domain/src/x.ts', 'packages/x/../domain/src/x.ts']) {
    assert.ok(nega(claudeEdit(r, path.join(r, f))), f);
    assert.ok(nega(agyEdit(r, path.join(r, f))), f);
  }
});
test('a3: caminho absoluto dentro da pista nega; fora da pista passa', () => {
  const r = mkRoot();
  assert.ok(nega(agyCmd(r, `Set-Content ${path.join(r, 'apps/mobile/src/db/schema.ts')} a`, tmp())));
  assert.ok(passa(claudeBash(r, `Set-Content ${path.join(tmp(), 'x.ts')} a`)));
});

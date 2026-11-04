import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const PROGRAMA = aqui('./pre-despacho.mjs');
const SCHEMAS = aqui('./lib/fixtures');

const git = (repo, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', repo, ...args], { encoding: 'utf8' }).trim();

const SECAO10 = '\n## 10. Formato de entrega\nCopie o criterio palavra por palavra.\n\n## 11. Criterios\n';

// repo, raiz (com gate vigente) e docs temporarios; o contrato aponta para a base dada
const ambiente = ({ commit } = {}) => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'predesp-prog-'));
  const repo = path.join(tmp, 'repo');
  const raiz = path.join(tmp, 'raiz');
  const docs = path.join(tmp, 'docs');
  mkdirSync(repo);
  mkdirSync(path.join(docs, 'v1', 'contratos'), { recursive: true });
  mkdirSync(path.join(raiz, '_gate-bin', 'abc1234', 'tools', 'agents'), { recursive: true });
  writeFileSync(path.join(raiz, '_gate-bin', 'VIGENTE.txt'), 'abc1234\n');
  writeFileSync(path.join(raiz, '_gate-bin', 'abc1234', 'tools', 'agents', 'gate.mjs'), '');
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(repo, 'a.txt'), 'a');
  git(repo, 'add', 'a.txt');
  git(repo, 'commit', '-q', '-m', 'base');
  const cab = {
    id: 'tarefa-x', modo: 'agente normal', executor: { harness: 'claude', modelo: 'sonnet' }, base: { branch: 'main', commit: commit ?? git(repo, 'rev-parse', 'HEAD') },
    pista: 'pista-x', arquivos_permitidos: ['b.txt'], comandos_validacao: ['node --test b.test.mjs'], limites: { turnos: 20, minutos: 20 }, criterios: ['C1 um'],
  };
  writeFileSync(path.join(docs, 'v1', 'contratos', 'tarefa-x.md'), `# c\n\n\`\`\`json contrato\n${JSON.stringify(cab, null, 2)}\n\`\`\`\n${SECAO10}`);
  return { tmp, repo, raiz, docs };
};

const roda = (amb, args) => {
  const r = spawnSync(process.execPath, [PROGRAMA, ...args, '--raiz', amb.raiz, '--docs', amb.docs, '--repo', amb.repo, '--schemas', SCHEMAS], { encoding: 'utf8', timeout: 60000 });
  return { code: r.status, linhas: r.stdout.split('\n').filter(Boolean), err: r.stderr };
};

test('PRONTO: contrato bom sai com 0, linhas OK em ASCII e PRONTO na ultima', () => {
  const amb = ambiente();
  const r = roda(amb, ['tarefa-x']);
  assert.equal(r.code, 0, r.linhas.join('\n') + r.err);
  assert.equal(r.linhas.at(-1), 'PRONTO');
  assert.ok(r.linhas.slice(0, -1).every((l) => /^OK [A-Z_]+ [\x20-\x7E]+$/.test(l)), r.linhas.join('\n'));
  assert.ok(r.linhas.some((l) => l.startsWith('OK BASE_VELHA ')));
  rmSync(amb.tmp, { recursive: true, force: true });
});

test('NAO PRONTO: base velha sai com 1, linha FALTA e NAO PRONTO na ultima', () => {
  const amb = ambiente({ commit: 'abcdef1' });
  const r = roda(amb, ['tarefa-x']);
  assert.equal(r.code, 1, r.linhas.join('\n'));
  assert.equal(r.linhas.at(-1), 'NAO PRONTO');
  assert.ok(r.linhas.some((l) => l.startsWith('FALTA BASE_VELHA ')));
  rmSync(amb.tmp, { recursive: true, force: true });
});

test('AVISO nao reprova: pasta _despacho existente sai com 0', () => {
  const amb = ambiente();
  mkdirSync(path.join(amb.raiz, '_despacho', 'tarefa-x'), { recursive: true });
  const r = roda(amb, ['tarefa-x']);
  assert.equal(r.code, 0);
  assert.ok(r.linhas.some((l) => l.startsWith('AVISO JA_DESPACHADO ')));
  rmSync(amb.tmp, { recursive: true, force: true });
});

test('--manual troca a suite inteira de FALTA para AVISO', () => {
  const amb = ambiente();
  const arq = path.join(amb.docs, 'v1', 'contratos', 'tarefa-x.md');
  const cab = { id: 'tarefa-x', modo: 'agente normal', executor: { harness: 'claude', modelo: 'sonnet' }, base: { branch: 'main', commit: git(amb.repo, 'rev-parse', 'HEAD') }, pista: 'pista-x', arquivos_permitidos: ['b.txt'], comandos_validacao: ['node --test tools/agents'], limites: { turnos: 20, minutos: 20 }, criterios: ['C1 um'] };
  writeFileSync(arq, `# c\n\n\`\`\`json contrato\n${JSON.stringify(cab)}\n\`\`\`\n`);
  assert.equal(roda(amb, ['tarefa-x']).code, 1);
  const r = roda(amb, ['tarefa-x', '--manual']);
  assert.equal(r.code, 0);
  assert.ok(r.linhas.some((l) => l.startsWith('AVISO SUITE_INTEIRA ')));
  rmSync(amb.tmp, { recursive: true, force: true });
});

test('SEM_FRASE_CRITERIOS: contrato sem a secao ## 10. sai com 1 e linha FALTA; --manual vira AVISO e sai com 0', () => {
  const amb = ambiente();
  const arq = path.join(amb.docs, 'v1', 'contratos', 'tarefa-x.md');
  writeFileSync(arq, readFileSync(arq, 'utf8').replace(SECAO10, ''));
  const r = roda(amb, ['tarefa-x']);
  assert.equal(r.code, 1, r.linhas.join('\n'));
  assert.ok(r.linhas.some((l) => l.startsWith('FALTA SEM_FRASE_CRITERIOS ')));
  const m = roda(amb, ['tarefa-x', '--manual']);
  assert.equal(m.code, 0);
  assert.ok(m.linhas.some((l) => l.startsWith('AVISO SEM_FRASE_CRITERIOS ')));
  rmSync(amb.tmp, { recursive: true, force: true });
});

test('LE_O_TEXTO_SEM_COMANDO: teste de fora que le o arquivo e nao esta nos comandos sai com 1; --manual vira AVISO', () => {
  const amb = ambiente();
  writeFileSync(path.join(amb.repo, 'b.txt'), 'b');
  writeFileSync(path.join(amb.repo, 'b.test.mjs'), "import { readFileSync } from 'node:fs';\nreadFileSync('b.txt');\n");
  writeFileSync(path.join(amb.repo, 'c.test.mjs'), "import { readFileSync } from 'node:fs';\nreadFileSync('b.txt');\n");
  git(amb.repo, 'add', '.');
  git(amb.repo, 'commit', '-q', '-m', 'testes');
  const arq = path.join(amb.docs, 'v1', 'contratos', 'tarefa-x.md');
  const base = git(amb.repo, 'rev-parse', 'HEAD');
  writeFileSync(arq, readFileSync(arq, 'utf8').replace(/"commit": "[0-9a-f]+"/, `"commit": "${base}"`));
  const r = roda(amb, ['tarefa-x']);
  assert.equal(r.code, 1, r.linhas.join('\n'));
  assert.ok(r.linhas.some((l) => /^FALTA LE_O_TEXTO_SEM_COMANDO .*c\.test\.mjs/.test(l)), r.linhas.join('\n'));
  assert.ok(!r.linhas.some((l) => /^FALTA LE_O_TEXTO_SEM_COMANDO .*b\.test\.mjs/.test(l)));
  const m = roda(amb, ['tarefa-x', '--manual']);
  assert.equal(m.code, 0, m.linhas.join('\n'));
  assert.ok(m.linhas.some((l) => l.startsWith('AVISO LE_O_TEXTO_SEM_COMANDO ')));
  rmSync(amb.tmp, { recursive: true, force: true });
});

test('EDITOR_ABERTO: a linha sai no programa e nunca reprova (o padrao dos processos nao e injetavel aqui)', () => {
  const amb = ambiente();
  const r = roda(amb, ['tarefa-x']);
  assert.ok(r.linhas.some((l) => /^(OK|AVISO) EDITOR_ABERTO /.test(l)), r.linhas.join('\n'));
  assert.ok(!r.linhas.some((l) => l.startsWith('FALTA EDITOR_ABERTO ')));
  rmSync(amb.tmp, { recursive: true, force: true });
});

test('uso errado sai com 2 e uma linha FALHA <codigo> <texto>', () => {
  const amb = ambiente();
  for (const [args, codigo] of [[[], 'USO'], [['a', 'b'], 'USO'], [['tarefa-x', '--nada'], 'USO'], [['Id Torto'], 'ID_INVALIDO'], [['nao-existe'], 'CONTRATO_AUSENTE']]) {
    const r = roda(amb, args);
    assert.equal(r.code, 2, args.join(' '));
    assert.equal(r.linhas.length, 0);
    assert.match(r.err.trim(), new RegExp(`^FALHA ${codigo} [\\x20-\\x7E]+$`), args.join(' '));
  }
  rmSync(amb.tmp, { recursive: true, force: true });
});

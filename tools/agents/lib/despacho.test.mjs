import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { planejar, montarPrompt, montarHooksClaude } from './despacho.mjs';

const contrato = { id: 'tarefa-um', pista: 'minha-pista', base: { branch: 'infra/m2', commit: 'abc1234' }, limites: { turnos: 5, minutos: 5 } };
const dirs = { raiz: path.resolve('raiz-x'), repo: path.resolve('repo-x') };

test('P1 planejar: branch, pista, despachoDir e 6 juncoes', () => {
  const p = planejar(contrato, dirs);
  assert.equal(p.branch, 'tarefa/tarefa-um');
  assert.equal(p.base, 'abc1234');
  assert.equal(p.pista.caminho, path.join(dirs.raiz, 'pistas', 'minha-pista'));
  assert.equal(p.despachoDir, path.join(dirs.raiz, '_despacho', 'tarefa-um'));
  assert.equal(p.junctions.length, 6);
  assert.deepEqual(p.junctions[0], { de: path.join(dirs.repo, 'node_modules'), para: path.join(p.pista.caminho, 'node_modules') });
  assert.deepEqual(p.junctions[1], { de: path.join(dirs.repo, 'apps', 'mobile', 'node_modules'), para: path.join(p.pista.caminho, 'apps', 'mobile', 'node_modules') });
  assert.equal(p.junctions[5].para, path.join(p.pista.caminho, 'tools', 'mvp-report', 'node_modules'));
  for (const f of Object.values(p.arquivosDespacho)) assert.equal(path.dirname(f), p.despachoDir);
  assert.deepEqual(Object.keys(p.arquivosDespacho), ['autorizacao', 'schema', 'saida', 'stderr', 'relatorio', 'meta', 'hooks', 'hookLog']);
});

test('H4 montarHooksClaude: estrutura exata, caminhos com / e aspas, nada vem da pista', () => {
  const repo = path.resolve('repo-x');
  const p = planejar({ ...contrato, executor: { harness: 'claude' } }, dirs);
  const a = p.arquivosDespacho;
  const h = montarHooksClaude({ repo, autorizacao: a.autorizacao, log: a.hookLog });
  const f = (x) => x.replace(/\\/g, '/');
  assert.deepEqual(h, {
    hooks: { PreToolUse: [{ matcher: 'Edit|Write|MultiEdit|Bash', hooks: [{ type: 'command', command: `node "${f(path.join(repo, 'tools/agents/hooks/protected-paths.mjs'))}" claude --autorizacao "${f(a.autorizacao)}" --log "${f(a.hookLog)}"` }] }] },
  });
  const caminhos = h.hooks.PreToolUse[0].hooks[0].command.match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  assert.equal(caminhos.length, 3);
  for (const c of caminhos) {
    assert.ok(!c.includes('\\'), c);
    assert.ok(!c.startsWith(f(p.pista.caminho)), c);
  }
});

test('H7 planejar: plano.hook por harness', () => {
  const de = (harness) => planejar({ ...contrato, executor: { harness } }, dirs).hook;
  assert.deepEqual(de('claude'), { ligado: true, settings: path.join(dirs.raiz, '_despacho', 'tarefa-um', 'hooks-claude.json') });
  for (const h of ['agy', 'opencode']) assert.deepEqual(de(h), { ligado: false, motivo: 'harness sem hook ligado (h2)' });
});

test('P1 planejar: puro (repetivel, nao altera o contrato) e sem fs nem processo', () => {
  const copia = structuredClone(contrato);
  assert.deepEqual(planejar(contrato, dirs), planejar(contrato, dirs));
  assert.deepEqual(contrato, copia);
  const fonte = readFileSync(new URL('./despacho.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(fonte, /node:fs|node:child_process/);
});

test('P2 prompt: fixo, com id, contrato.md e regra de um comando', () => {
  const p = montarPrompt(contrato);
  for (const trecho of ['tarefa-um', '.agent/contrato.md', 'um comando por chamada', 'sem ;']) assert.ok(p.includes(trecho), trecho);
  assert.equal(p, montarPrompt(contrato));
  const outro = montarPrompt({ ...contrato, id: 'outra' });
  assert.notEqual(outro, p);
  assert.equal(outro.replaceAll('outra', 'tarefa-um'), p);
});

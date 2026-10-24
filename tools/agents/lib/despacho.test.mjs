import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { planejar, montarPrompt, montarHooksClaude, montarHooksAgy, montarPermissoesOpencode } from './despacho.mjs';

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
  assert.deepEqual(Object.keys(p.arquivosDespacho), ['autorizacao', 'schema', 'saida', 'stderr', 'relatorio', 'meta', 'hooks', 'hookLog', 'hooksAgy', 'opencodeConfig']);
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
  assert.deepEqual(de('claude'), { ligado: true, tipo: 'claude', settings: path.join(dirs.raiz, '_despacho', 'tarefa-um', 'hooks-claude.json') });
  const pista = path.join(dirs.raiz, 'pistas', 'minha-pista');
  const d = path.join(dirs.raiz, '_despacho', 'tarefa-um');
  assert.deepEqual(de('agy'), { ligado: true, tipo: 'agy', arquivoPista: path.join(pista, '.agents', 'hooks.json'), copia: path.join(d, 'hooks-agy.json') });
  assert.deepEqual(de('opencode'), { ligado: true, tipo: 'opencode', arquivoPista: path.join(pista, 'opencode.json'), copia: path.join(d, 'opencode-config.json') });
});

test('C1 planejar: hook ligado com tipo para os tres harness; desconhecido (ate "constructor") desligado', () => {
  const p = (harness) => planejar({ ...contrato, executor: { harness } }, dirs);
  for (const h of ['claude', 'agy', 'opencode']) {
    assert.equal(p(h).hook.ligado, true);
    assert.equal(p(h).hook.tipo, h);
  }
  assert.equal(p('agy').arquivosDespacho.hooksAgy, path.join(p('agy').despachoDir, 'hooks-agy.json'));
  assert.equal(p('agy').arquivosDespacho.opencodeConfig, path.join(p('agy').despachoDir, 'opencode-config.json'));
  for (const h of ['xyz', 'constructor', undefined]) assert.equal(p(h).hook.ligado, false, String(h));
});

test('C2 montarHooksAgy: PreToolUse com matcher *, timeout 10, script do repo e nada da pista', () => {
  const repo = path.resolve('repo-x');
  const a = planejar({ ...contrato, executor: { harness: 'agy' } }, dirs);
  const h = montarHooksAgy({ repo, autorizacao: a.arquivosDespacho.autorizacao, log: a.arquivosDespacho.hookLog });
  const g = h['area-protegida'].PreToolUse[0];
  assert.equal(g.matcher, '*');
  assert.equal(g.hooks.length, 1);
  assert.equal(g.hooks[0].type, 'command');
  assert.equal(g.hooks[0].timeout, 10);
  const f = (x) => x.replace(/\\/g, '/');
  const cmd = g.hooks[0].command;
  assert.equal(cmd, `node ${f(path.join(repo, 'tools/agents/hooks/protected-paths.mjs'))} agy --autorizacao ${f(a.arquivosDespacho.autorizacao)} --log ${f(a.arquivosDespacho.hookLog)}`);
  assert.ok(!cmd.includes('\\') && !cmd.includes(f(a.pista.caminho)), cmd);
});

test('C1 montarHooksAgy: command sem aspas, quebra em palavras nos argumentos certos; claude segue com aspas', () => {
  const repo = path.resolve('repo-x');
  const a = planejar({ ...contrato, executor: { harness: 'agy' } }, dirs).arquivosDespacho;
  const f = (x) => x.replace(/\\/g, '/');
  const cmd = montarHooksAgy({ repo, autorizacao: a.autorizacao, log: a.hookLog })['area-protegida'].PreToolUse[0].hooks[0].command;
  assert.ok(!cmd.includes('"'), cmd);
  assert.deepEqual(cmd.split(' '), ['node', f(path.join(repo, 'tools/agents/hooks/protected-paths.mjs')), 'agy', '--autorizacao', f(a.autorizacao), '--log', f(a.hookLog)]);
  assert.ok(montarHooksClaude({ repo, autorizacao: a.autorizacao, log: a.hookLog }).hooks.PreToolUse[0].hooks[0].command.includes('"'));
});

const CONTRATO_OC = { arquivos_permitidos: ['tools/agents/lib/x.mjs', 'tools/agents/lib/dir/'], areas_autorizadas: ['packages/domain/'], comandos_validacao: ['node --test a.test.mjs', 'git status --short'] };
const AREAS = ['packages/domain/', 'apps/mobile/src/db/schema.ts', 'apps/mobile/src/db/backup.ts'];
const CONTROLE_X = ['.claude/settings.json', 'opencode.json', 'autorizacao.json', 'tools/agents/hooks/'];
const permissoes = (c = CONTRATO_OC) => montarPermissoesOpencode(c, { areas: AREAS, controle: CONTROLE_X });

test('C3 montarPermissoesOpencode: leitura, skill e webfetch', () => {
  const r = permissoes();
  assert.equal(r.$schema, 'https://opencode.ai/config.json');
  const p = r.permission;
  assert.equal(Object.keys(p)[0], '*');
  assert.equal(p['*'], 'deny');
  assert.deepEqual(p.read, { '*': 'allow', '*.env': 'deny', '*.env.*': 'deny' });
  for (const k of ['glob', 'grep', 'list']) assert.equal(p[k], 'allow', k);
  for (const k of ['skill', 'webfetch', 'external_directory']) assert.equal(p[k], 'deny', k);
});

test('C3 montarPermissoesOpencode: edit comeca em deny, todo allow antes dos deny, pasta vira /**', () => {
  const e = permissoes().permission.edit;
  const chaves = Object.keys(e);
  assert.equal(chaves[0], '*');
  assert.equal(e['*'], 'deny');
  assert.deepEqual(chaves.filter((k) => e[k] === 'allow'), ['tools/agents/lib/x.mjs', 'tools/agents/lib/dir/**', '.agent/**', 'packages/domain/**']);
  assert.deepEqual(chaves.filter((k, i) => i > 0 && e[k] === 'deny'), ['apps/mobile/src/db/schema.ts', 'apps/mobile/src/db/backup.ts', '.claude/settings.json', 'opencode.json', '**/autorizacao.json', 'tools/agents/hooks/**']);
  const ultimoAllow = Math.max(...chaves.map((k, i) => (e[k] === 'allow' ? i : -1)));
  const primeiroDeny = chaves.findIndex((k, i) => i > 0 && e[k] === 'deny');
  assert.ok(ultimoAllow < primeiroDeny);
});

test('C3 montarPermissoesOpencode: area autorizada nao recebe deny; chave repetida nao fura a ordem', () => {
  const e = permissoes().permission.edit;
  assert.equal(e['packages/domain/**'], 'allow');
  const c = { ...CONTRATO_OC, arquivos_permitidos: ['opencode.json', 'apps/mobile/src/db/schema.ts'] };
  const k = Object.keys(permissoes(c).permission.edit);
  assert.deepEqual(k.slice(0, 3), ['*', '.agent/**', 'packages/domain/**']);
  assert.equal(permissoes(c).permission.edit['opencode.json'], 'deny');
});

test('C3 montarPermissoesOpencode: bash fecha, comandos do contrato como allow, git push * deny e ultimo', () => {
  const b = permissoes().permission.bash;
  const chaves = Object.keys(b);
  assert.equal(chaves[0], '*');
  assert.equal(b['*'], 'deny');
  for (const c of ['git status', 'git status *', 'git diff *', 'git log *', 'git add *', 'git commit *', 'node --test a.test.mjs', 'git status --short']) assert.equal(b[c], 'allow', c);
  assert.equal(chaves.at(-1), 'git push *');
  assert.equal(b['git push *'], 'deny');
  const colide = permissoes({ ...CONTRATO_OC, comandos_validacao: ['git push *'] }).permission.bash;
  assert.equal(Object.keys(colide).at(-1), 'git push *');
  assert.equal(colide['git push *'], 'deny');
});

test('C3 montarPermissoesOpencode: pura e sem areas_autorizadas', () => {
  const copia = structuredClone(CONTRATO_OC);
  assert.deepEqual(permissoes(), permissoes());
  assert.deepEqual(CONTRATO_OC, copia);
  const sem = permissoes({ arquivos_permitidos: ['a.txt'] }).permission.edit;
  assert.equal(sem['packages/domain/**'], 'deny');
  assert.equal(sem['a.txt'], 'allow');
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

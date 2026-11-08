import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerContrato } from './lib/contrato.mjs';
import { adquirir, MAX_DESPACHOS } from './lib/trava.mjs';

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const DISPATCH = aqui('./dispatch.mjs');
const SCHEMAS = aqui('./lib/fixtures');
const FIX = aqui('./lib/dispatch-fixtures');
const falso = (nome) => path.join(FIX, nome);
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// repositorio temporario: raiz de despacho (vazia) ao lado do repo
const ambiente = ({ nomeRepo = 'repo', nomeRaiz = 'raiz' } = {}) => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'dispatch-'));
  const repo = path.join(tmp, nomeRepo);
  const raiz = path.join(tmp, nomeRaiz);
  mkdirSync(repo);
  mkdirSync(raiz);
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 't');
  git(repo, 'config', 'user.email', 't@t');
  writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n');
  writeFileSync(path.join(repo, 'README.md'), 'x\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  mkdirSync(path.join(repo, 'node_modules'));
  // fora do commit: so o repo precisa do script do hook (a pista nao ganha arquivo novo)
  mkdirSync(path.join(repo, 'tools/agents/hooks'), { recursive: true });
  writeFileSync(path.join(repo, 'tools/agents/hooks/protected-paths.mjs'), '');
  writeFileSync(path.join(repo, 'tools/agents/hooks/protected-paths.json'), '["packages/domain/", "outra/area.ts"]');
  writeFileSync(path.join(repo, '.git/info/exclude'), 'tools/\n');
  const base = git(repo, 'rev-parse', '--short', 'HEAD');
  return { tmp, repo, raiz, base };
};

const contratoMd = (amb, { id = 'tarefa-x', harness = 'agy', commit = amb.base, pista = 'pista-x', minutos = 5 } = {}) => {
  const cab = {
    id, modo: 'agente normal', executor: { harness, modelo: 'm' }, base: { branch: 'main', commit }, pista,
    arquivos_permitidos: ['feito.txt'], areas_autorizadas: ['area/'], comandos_validacao: ['node --test'],
    limites: { turnos: 5, minutos }, criterios: ['C1 um'],
  };
  const arquivo = path.join(amb.tmp, `${id}.md`);
  writeFileSync(arquivo, `# c\n\n\`\`\`json contrato\n${JSON.stringify(cab, null, 2)}\n\`\`\`\n`);
  return arquivo;
};

const rodar = (amb, arquivo, extra = [], { env, usaFalso = 'harness-agy.mjs' } = {}) => {
  const args = [DISPATCH, arquivo, '--raiz', amb.raiz, '--repo', amb.repo, '--schemas', SCHEMAS, ...(usaFalso ? ['--harness-falso', falso(usaFalso)] : []), ...extra];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', env: env ?? process.env, timeout: 60000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout };
};

const despacho = (amb, id = 'tarefa-x') => path.join(amb.raiz, '_despacho', id);
const pistaDe = (amb, nome = 'pista-x') => path.join(amb.raiz, 'pistas', nome);
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const travas = (amb) => readdirSync(path.join(amb.raiz, '_despacho', '_trava'));
const limpa = (amb) => rmSync(amb.tmp, { recursive: true, force: true });

test('P4 --dry-run imprime plano e comando e nao cria nada', () => {
  for (const [harness, primeiro] of [['claude', '-p'], ['agy', '-p'], ['opencode', 'run']]) {
    const amb = ambiente();
    const r = rodar(amb, contratoMd(amb, { harness }), ['--dry-run'], { usaFalso: null });
    assert.equal(r.code, 0, r.out);
    const { plano, comando } = JSON.parse(r.stdout.slice(0, r.stdout.lastIndexOf('}') + 1));
    assert.equal(plano.id, 'tarefa-x');
    assert.equal(comando.exe, harness);
    assert.equal(comando.args[0], primeiro);
    assert.ok(comando.args.some((a) => a.includes('tarefa-x') && a.includes('.agent/contrato.md')));
    assert.deepEqual(readdirSync(amb.raiz), []);
    assert.equal(git(amb.repo, 'worktree', 'list').split('\n').length, 1);
    limpa(amb);
  }
});

test('P5 uso errado e contrato invalido dao codigo 2 sem criar pasta', () => {
  const amb = ambiente();
  const ok = contratoMd(amb);
  const ruim = contratoMd(amb, { id: 'ruim', harness: 'xyz' });
  const casos = [
    [[], null],
    [[path.join(amb.tmp, 'nao-existe.md')], null],
    [[ok, '--max-simultaneas', 'abc'], null],
    [[ok, '--timeout-ms', '0'], null],
    [[ok, '--flag-estranha'], null],
    [[ruim], /\/executor\/harness SCHEMA/],
  ];
  for (const [args, esperado] of casos) {
    const r = spawnSync(process.execPath, [DISPATCH, ...args, '--raiz', amb.raiz, '--repo', amb.repo, '--schemas', SCHEMAS], { encoding: 'utf8' });
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    if (esperado) assert.match(r.stdout, esperado);
  }
  assert.deepEqual(readdirSync(amb.raiz), []);
  limpa(amb);
});

test('P6 pista nova: worktree, branch, base, juncao, contrato copiado', () => {
  const amb = ambiente();
  const arquivo = contratoMd(amb);
  const r = rodar(amb, arquivo);
  assert.equal(r.code, 0, r.out);
  const pista = pistaDe(amb);
  assert.equal(git(pista, 'rev-parse', '--abbrev-ref', 'HEAD'), 'tarefa/tarefa-x');
  assert.equal(git(amb.repo, 'branch', '--list', 'tarefa/tarefa-x').includes('tarefa/tarefa-x'), true);
  assert.equal(git(pista, 'rev-parse', '--short', 'HEAD~1'), amb.base);
  assert.ok(lstatSync(path.join(pista, 'node_modules')).isSymbolicLink());
  assert.ok(!existsSync(path.join(pista, 'apps')));
  assert.equal(readFileSync(path.join(pista, '.agent', 'contrato.md'), 'utf8'), readFileSync(arquivo, 'utf8'));
  limpa(amb);
});

test('P6 pista parte de base.commit; base que o git nao resolve da codigo 2 sem pista', () => {
  const amb = ambiente();
  writeFileSync(path.join(amb.repo, 'outro.txt'), 'y\n');
  git(amb.repo, 'add', '.');
  git(amb.repo, 'commit', '-q', '-m', 'segundo');
  const r = rodar(amb, contratoMd(amb), [], { usaFalso: 'harness-falha.mjs' });
  assert.equal(git(pistaDe(amb), 'rev-parse', '--short', 'HEAD'), amb.base, r.out);
  const amb2 = ambiente();
  const r2 = rodar(amb2, contratoMd(amb2, { commit: 'deadbeef' }));
  assert.equal(r2.code, 2, r2.out);
  assert.ok(!existsSync(pistaDe(amb2)));
  limpa(amb);
  limpa(amb2);
});

test('P7 pista que ja existe: codigo 2, nada muda, trava liberada', () => {
  const amb = ambiente();
  const arquivo = contratoMd(amb);
  assert.equal(rodar(amb, arquivo).code, 0);
  const foto = () => {
    const pista = pistaDe(amb);
    return readdirSync(pista, { recursive: true })
      .filter((f) => !f.split(path.sep).includes('node_modules'))
      .map((f) => `${f}:${statSync(path.join(pista, f)).mtimeMs}`).join('|');
  };
  const antes = foto();
  const r = rodar(amb, arquivo);
  assert.equal(r.code, 2);
  assert.match(r.out, /FALHA PISTA_EXISTE/);
  assert.equal(foto(), antes);
  assert.deepEqual(travas(amb), []);
  limpa(amb);
});

test('P8 harness estilo agy: relatorio validado, arquivos do despacho e aviso de tarefa', () => {
  const amb = ambiente();
  const r = rodar(amb, contratoMd(amb));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^OK tarefa-x /m);
  const d = despacho(amb);
  const rel = json(path.join(d, 'relatorio.json'));
  assert.equal(rel.tarefa, 'tarefa-x');
  assert.deepEqual(json(path.join(pistaDe(amb), '.agent', 'report.json')), rel);
  const meta = json(path.join(d, 'meta.json'));
  assert.equal(meta.validacao, 'ok');
  assert.deepEqual(meta.avisos, []);
  assert.equal(meta.harness, 'agy');
  assert.deepEqual(json(path.join(d, 'autorizacao.json')), { tarefa: 'tarefa-x', areas_autorizadas: ['area/'], arquivos_permitidos: ['feito.txt'] });
  assert.match(readFileSync(path.join(d, 'saida.txt'), 'utf8'), /"status":"SUCCESS"/);
  assert.ok(existsSync(path.join(d, 'relatorio.schema.json')));
  assert.equal(git(pistaDe(amb), 'log', '-1', '--format=%s'), 'feito');
  assert.deepEqual(travas(amb), []);
  limpa(amb);

  const amb2 = ambiente();
  const r2 = rodar(amb2, contratoMd(amb2), [], { env: { ...process.env, RELATORIO_TAREFA: 'outra' } });
  assert.equal(r2.code, 0, r2.out);
  assert.deepEqual(json(path.join(despacho(amb2), 'meta.json')).avisos, ['TAREFA_DIFERENTE']);
  limpa(amb2);
});

test('P9 harness estilo opencode: relatorio vem do arquivo', () => {
  const amb = ambiente();
  const r = rodar(amb, contratoMd(amb, { harness: 'opencode' }), [], { usaFalso: 'harness-opencode.mjs' });
  assert.equal(r.code, 0, r.out);
  const noArquivo = json(path.join(pistaDe(amb), '.agent', 'report.json'));
  assert.deepEqual(json(path.join(despacho(amb), 'relatorio.json')), noArquivo);
  assert.equal(noArquivo.tarefa, 'tarefa-x');
  assert.match(readFileSync(path.join(despacho(amb), 'saida.txt'), 'utf8'), /texto livre/);
  limpa(amb);
});

test('P10 falhas: sem relatorio, relatorio invalido, tempo, executavel; trava sempre liberada', () => {
  // a) sai com 3 e nao deixa relatorio
  let amb = ambiente();
  let r = rodar(amb, contratoMd(amb), [], { usaFalso: 'harness-falha.mjs' });
  assert.equal(r.code, 1);
  assert.match(r.out, /FALHA SEM_RELATORIO/);
  assert.equal(json(path.join(despacho(amb), 'meta.json')).codigo_saida, 3);
  assert.deepEqual(travas(amb), []);
  limpa(amb);

  // b) relatorio com campo faltando
  amb = ambiente();
  r = rodar(amb, contratoMd(amb), [], { env: { ...process.env, RELATORIO: 'relatorio-invalido.json' } });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /duvidas/);
  assert.equal(json(path.join(despacho(amb), 'meta.json')).validacao, 'erros');
  assert.ok(!existsSync(path.join(despacho(amb), 'relatorio.json')));
  assert.deepEqual(travas(amb), []);
  limpa(amb);

  // c) tempo esgotado: o filho morre
  amb = ambiente();
  const pidArquivo = path.join(amb.tmp, 'pid.txt');
  r = rodar(amb, contratoMd(amb), ['--timeout-ms', '1500'], { usaFalso: 'harness-lento.mjs', env: { ...process.env, PID_ARQUIVO: pidArquivo } });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FALHA TEMPO_ESGOTADO/);
  const pid = Number(readFileSync(pidArquivo, 'utf8'));
  assert.throws(() => process.kill(pid, 0), 'o filho ainda esta vivo');
  assert.ok(existsSync(path.join(despacho(amb), 'meta.json')));
  assert.deepEqual(travas(amb), []);
  limpa(amb);

  // d) executavel real inexistente, PATH so com o git
  amb = ambiente();
  const gitDir = path.dirname(execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['git'], { encoding: 'utf8' }).split(/\r?\n/)[0]);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toLowerCase() !== 'path'));
  r = rodar(amb, contratoMd(amb, { harness: 'opencode' }), [], { usaFalso: null, env: { ...env, PATH: gitDir } });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /FALHA EXECUTAVEL_NAO_ENCONTRADO/);
  assert.ok(existsSync(path.join(despacho(amb), 'meta.json')));
  assert.deepEqual(travas(amb), []);
  limpa(amb);
});

test('P11 trava cheia: codigo 2 sem criar pista; com --max-simultaneas maior roda', () => {
  const amb = ambiente();
  const arquivo = contratoMd(amb);
  for (let i = 0; i < MAX_DESPACHOS; i++) assert.ok(adquirir({ raiz: amb.raiz, id: `o${i}`, minutos: 40, max: MAX_DESPACHOS }).ok);
  const r = rodar(amb, arquivo);
  assert.equal(r.code, 2);
  assert.match(r.out, /FALHA TRAVA_CHEIA/);
  assert.ok(!existsSync(path.join(amb.raiz, 'pistas')));
  assert.ok(!existsSync(despacho(amb)));
  const r3 = rodar(amb, arquivo, ['--max-simultaneas', String(MAX_DESPACHOS + 1)]);
  assert.equal(r3.code, 0, r3.out);
  limpa(amb);
});

test('P12 nada fora da pista e de _despacho; contrato deste bloco e valido', () => {
  const amb = ambiente();
  assert.equal(rodar(amb, contratoMd(amb)).code, 0);
  assert.equal(git(amb.repo, 'status', '--short'), '');
  assert.deepEqual(readdirSync(amb.raiz).sort(), ['_despacho', 'pistas']);
  assert.deepEqual(readdirSync(despacho(amb)).sort(), ['autorizacao.json', 'hooks-agy.json', 'meta.json', 'relatorio.json', 'relatorio.schema.json', 'saida.txt', 'stderr.txt']);
  limpa(amb);

  const c = lerContrato(path.join(FIX, 'contrato-m2-b3.md'), { schemaPath: path.join(SCHEMAS, 'contrato.schema.json') });
  assert.equal(c.id, 'm2-b3-dispatch');
  assert.equal(c.arquivos_permitidos.length, 7);
  assert.equal(c.criterios.length, 13);
});

// harness falso que escreve fora da pista (no repositorio principal) e depois age como o do agy
const falsoQueSuja = (amb, repo) => {
  const f = path.join(amb.tmp, 'harness-suja.mjs');
  const base = new URL('./lib/dispatch-fixtures/harness-base.mjs', import.meta.url).href;
  writeFileSync(f, `import { writeFileSync } from 'node:fs';
import { relatorio, commitaArquivo } from ${JSON.stringify(base)};
writeFileSync(${JSON.stringify(path.join(repo, 'sujeira.txt'))}, 'fora da pista');
commitaArquivo();
console.log(JSON.stringify({ conversation_id: 'x', status: 'SUCCESS', response: JSON.stringify(relatorio()) }));
`);
  return f;
};

test('A3 meta.json grava o retrato de ANTES do harness (que escreve fora da pista)', async () => {
  const { retrato } = await import('./lib/retrato.mjs');
  const amb = ambiente();
  const esperado = retrato({ repo: amb.repo });
  const arquivo = contratoMd(amb);
  const r = spawnSync(process.execPath, [DISPATCH, arquivo, '--raiz', amb.raiz, '--repo', amb.repo, '--schemas', SCHEMAS, '--harness-falso', falsoQueSuja(amb, amb.repo)], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const meta = json(path.join(despacho(amb), 'meta.json'));
  assert.deepEqual(meta.retrato, esperado);
  assert.deepEqual(meta.avisos, []);
  assert.notDeepEqual(retrato({ repo: amb.repo }), esperado); // a sujeira existe, so nao esta no retrato
  limpa(amb);
});

test('A3 retrato que falha vira null + RETRATO_FALHOU e a saida continua 0', () => {
  const amb = ambiente();
  const r = rodar(amb, contratoMd(amb), [], { env: { ...process.env, DISPATCH_RETRATO_FALHA: '1' } });
  assert.equal(r.code, 0, r.out);
  const meta = json(path.join(despacho(amb), 'meta.json'));
  assert.equal(meta.retrato, null);
  assert.deepEqual(meta.avisos, ['RETRATO_FALHOU']);
  limpa(amb);
});

// m2-h1: contrato com areas_autorizadas e os arquivos que o dispatch grava para ligar o hook
const HOOK = aqui('./hooks/protected-paths.mjs');
const contratoArea = (amb, { harness = 'claude', areas = ['packages/domain/'], id = 'tarefa-x' } = {}) => {
  const arquivo = contratoMd(amb, { id, harness, pista: id });
  const c = JSON.parse(readFileSync(arquivo, 'utf8').split('```json contrato\n')[1].split('\n```')[0]);
  c.areas_autorizadas = areas;
  c.arquivos_permitidos = ['packages/domain/x.ts'];
  writeFileSync(arquivo, `# c\n\n\`\`\`json contrato\n${JSON.stringify(c, null, 2)}\n\`\`\`\n`);
  return arquivo;
};
const hookCli = (autorizacao, file_path, cwd) => {
  const r = spawnSync(process.execPath, [HOOK, 'claude', '--autorizacao', autorizacao], { input: JSON.stringify({ cwd, tool_name: 'Write', tool_input: { file_path } }), encoding: 'utf8' });
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision : undefined;
};

test('H4 dispatch grava hooks-claude.json fora da pista, sem BOM, e a pista fica sem arquivo novo', () => {
  const amb = ambiente();
  const r = rodar(amb, contratoArea(amb), [], { usaFalso: 'harness-opencode.mjs' });
  assert.equal(r.code, 0, r.out);
  const bruto = readFileSync(path.join(despacho(amb), 'hooks-claude.json'));
  assert.notEqual(bruto[0], 0xef);
  const h = JSON.parse(bruto.toString('utf8'));
  const cmd = h.hooks.PreToolUse[0].hooks[0].command;
  const f = (x) => x.replaceAll(path.sep, '/');
  assert.ok(cmd.includes(`"${f(path.join(amb.repo, 'tools/agents/hooks/protected-paths.mjs'))}"`), cmd);
  assert.ok(cmd.includes(`--autorizacao "${f(path.join(despacho(amb), 'autorizacao.json'))}"`), cmd);
  assert.ok(!cmd.includes(f(pistaDe(amb, 'tarefa-x'))), cmd);
  const pista = pistaDe(amb, 'tarefa-x');
  assert.equal(git(pista, 'status', '--short').split('\n').filter((l) => l && !l.includes('.agent/')).join(''), '');
  assert.ok(!readdirSync(pista, { recursive: true }).some((x) => /settings|hooks|opencode\.json/.test(x) && !x.includes('node_modules')));
  limpa(amb);
});

test('H5 dispatch passa --settings so para o claude (visivel no --dry-run); H7 plano.hook por harness', () => {
  for (const [harness, tipo] of [['claude', 'claude'], ['agy', 'agy'], ['opencode', 'opencode']]) {
    const amb = ambiente();
    const r = rodar(amb, contratoMd(amb, { harness }), ['--dry-run'], { usaFalso: null });
    assert.equal(r.code, 0, r.out);
    const { plano, comando } = JSON.parse(r.stdout.slice(0, r.stdout.lastIndexOf('}') + 1));
    assert.equal(comando.args.includes('--settings'), tipo === 'claude');
    assert.equal(plano.hook.tipo, tipo);
    if (tipo === 'claude') {
      assert.deepEqual(plano.hook, { ligado: true, tipo: 'claude', settings: path.join(despacho(amb), 'hooks-claude.json') });
      assert.equal(comando.args[comando.args.indexOf('--settings') + 1], plano.hook.settings);
      assert.ok(comando.args.indexOf('--settings') < comando.args.indexOf('--allowedTools'));
    } else assert.equal(plano.hook.ligado, true);
    assert.ok(!existsSync(despacho(amb)));
    limpa(amb);
  }
});

test('H6 a autorizacao que o dispatch gravou libera a area no hook; sem areas nega; controle nega', () => {
  const amb = ambiente();
  const pistaTmp = path.join(amb.tmp, 'pista-hook');
  mkdirSync(pistaTmp);
  writeFileSync(path.join(pistaTmp, '.git'), 'gitdir: x');
  const autorizar = (opcoes, id) => {
    assert.equal(rodar(amb, contratoArea(amb, { ...opcoes, id }), [], { usaFalso: 'harness-opencode.mjs' }).code, 0);
    return path.join(despacho(amb, id), 'autorizacao.json');
  };
  const com = autorizar({}, 'com-area');
  assert.notEqual(hookCli(com, path.join(pistaTmp, 'packages/domain/x.ts'), pistaTmp), 'deny');
  assert.equal(hookCli(com, path.join(pistaTmp, '.claude/settings.local.json'), pistaTmp), 'deny');
  const sem = autorizar({ areas: [] }, 'sem-area');
  assert.equal(hookCli(sem, path.join(pistaTmp, 'packages/domain/x.ts'), pistaTmp), 'deny');
  limpa(amb);
});

// m2-h1b: sem o script do hook no repo o claude ficaria sem hook em silencio
const semHook = (amb) => rmSync(path.join(amb.repo, 'tools/agents/hooks/protected-paths.mjs'));
const estado = (amb) => ({ raiz: readdirSync(amb.raiz, { recursive: true }).sort(), branches: git(amb.repo, 'branch', '--list'), pistas: git(amb.repo, 'worktree', 'list') });

test('B1 sem o script do hook no repo o dispatch recusa o claude com HOOK_AUSENTE, codigo 2', () => {
  const amb = ambiente();
  semHook(amb);
  const r = rodar(amb, contratoMd(amb, { harness: 'claude' }));
  assert.equal(r.code, 2, r.out);
  assert.ok(r.out.includes('HOOK_AUSENTE'), r.out);
  assert.ok(r.out.includes(path.join(amb.repo, 'tools/agents/hooks/protected-paths.mjs')), r.out);
  limpa(amb);
});

test('B2 a recusa vem antes de criar despacho, pista, branch e trava', () => {
  const amb = ambiente();
  semHook(amb);
  const antes = estado(amb);
  assert.equal(rodar(amb, contratoMd(amb, { harness: 'claude' })).code, 2);
  assert.deepEqual(estado(amb), antes);
  assert.ok(!existsSync(despacho(amb)) && !existsSync(pistaDe(amb)) && !/tarefa\/tarefa-x/.test(estado(amb).branches));
  limpa(amb);
});

test('B3 vale no dry-run e, desde o h2, tambem para agy e opencode', () => {
  const amb = ambiente();
  semHook(amb);
  assert.equal(rodar(amb, contratoMd(amb, { harness: 'claude' }), ['--dry-run'], { usaFalso: null }).code, 2);
  // desde o h2 o agy e o opencode tambem tem hook ligado: a recusa vale para os tres
  for (const harness of ['agy', 'opencode']) {
    const r = rodar(amb, contratoMd(amb, { harness }), ['--dry-run'], { usaFalso: null });
    assert.equal(r.code, 2, r.out);
    assert.ok(r.out.includes('HOOK_AUSENTE'), r.out);
  }
  limpa(amb);
});

test('B4 com o script presente o dry-run do claude devolve o plano de sempre', () => {
  const amb = ambiente();
  const r = rodar(amb, contratoMd(amb, { harness: 'claude' }), ['--dry-run'], { usaFalso: null });
  assert.equal(r.code, 0, r.out);
  const { plano } = JSON.parse(r.stdout.slice(0, r.stdout.lastIndexOf('}') + 1));
  assert.deepEqual(plano.hook, { ligado: true, tipo: 'claude', settings: path.join(despacho(amb), 'hooks-claude.json') });
  limpa(amb);
});

// harness falso criado no teste: sai com 1 e escreve (ou nao) no stderr
const falhaComStderr = (amb, stderr) => {
  const f = path.join(amb.tmp, 'harness-stderr.mjs');
  writeFileSync(f, `${stderr === null ? '' : `process.stderr.write(${JSON.stringify(stderr)});`}process.exit(1);`);
  return f;
};
const mensagemSemRelatorio = (stderr) => {
  const amb = ambiente();
  const f = falhaComStderr(amb, stderr);
  const r = rodar(amb, contratoMd(amb), ['--harness-falso', f], { usaFalso: null });
  limpa(amb);
  assert.equal(r.code, 1, r.out);
  return /FALHA SEM_RELATORIO (.*)/.exec(r.out)[1].trim();
};

test('C4 SEM_RELATORIO: stderr com conteudo entra na mensagem (primeira linha nao vazia, ate 200)', () => {
  assert.match(mensagemSemRelatorio('\n  \nError: --json-schema invalido\nsegunda\n'), /^sem relatorio \(saida 1; SAIDA_INVALIDA; ENOENT\) \| stderr: Error: --json-schema invalido$/);
  assert.ok(mensagemSemRelatorio(`${'x'.repeat(300)}\n`).endsWith(` | stderr: ${'x'.repeat(200)}`));
});

test('C5 SEM_RELATORIO: sem stderr (ou so em branco) a mensagem e a de antes', () => {
  for (const s of [null, '', ' \n\n']) assert.equal(mensagemSemRelatorio(s), 'sem relatorio (saida 1; SAIDA_INVALIDA; ENOENT)');
});

// m2-h2: agy e opencode ganham o arquivo de hook na pista, com copia byte a byte no despacho
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const comNaBase = (rel) => {
  const amb = ambiente();
  mkdirSync(path.dirname(path.join(amb.repo, rel)), { recursive: true });
  writeFileSync(path.join(amb.repo, rel), '{"ja":"existe"}');
  git(amb.repo, 'add', '-f', rel);
  git(amb.repo, 'commit', '-q', '-m', 'com o arquivo');
  return { ...amb, base: git(amb.repo, 'rev-parse', '--short', 'HEAD') };
};

test('C4 dispatch com agy: .agents/hooks.json na pista igual byte a byte a hooks-agy.json do despacho', () => {
  const amb = ambiente();
  const r = rodar(amb, contratoArea(amb, { harness: 'agy' }));
  assert.equal(r.code, 0, r.out);
  const naPista = readFileSync(path.join(pistaDe(amb, 'tarefa-x'), '.agents', 'hooks.json'));
  const copia = readFileSync(path.join(despacho(amb), 'hooks-agy.json'));
  assert.ok(naPista.equals(copia));
  const cmd = JSON.parse(naPista.toString('utf8'))['area-protegida'].PreToolUse[0].hooks[0].command;
  assert.ok(cmd.includes(`node ${path.join(amb.repo, 'tools/agents/hooks/protected-paths.mjs').replaceAll(path.sep, '/')} agy`) && !cmd.includes('"'), cmd);
  assert.ok(!existsSync(path.join(pistaDe(amb, 'tarefa-x'), 'opencode.json')));
  limpa(amb);
});

test('C4 C5 HOOK_JA_EXISTE: arquivo ja na base, saida 2, nada gravado e trava liberada', () => {
  for (const [harness, rel] of [['agy', '.agents/hooks.json'], ['opencode', 'opencode.json']]) {
    const amb = comNaBase(rel);
    const antes = estado(amb);
    const r = rodar(amb, contratoMd(amb, { harness }));
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /FALHA HOOK_JA_EXISTE/);
    assert.ok(r.out.includes(rel), r.out);
    assert.deepEqual(estado(amb), antes);
    assert.ok(!existsSync(despacho(amb)) && !existsSync(pistaDe(amb)));
    assert.ok(!existsSync(path.join(amb.raiz, '_despacho')));
    limpa(amb);
  }
});

test('C4 C5 o arquivo de um harness na base nao barra o outro', () => {
  const amb = comNaBase('opencode.json');
  assert.equal(rodar(amb, contratoMd(amb, { harness: 'agy' })).code, 0);
  limpa(amb);
});

test('C4 C5 HOOK_AUSENTE tambem para agy e opencode (script ou areas ausentes), sem criar nada', () => {
  for (const harness of ['agy', 'opencode']) {
    for (const f of ['protected-paths.mjs', 'protected-paths.json']) {
      const amb = ambiente();
      rmSync(path.join(amb.repo, 'tools/agents/hooks', f));
      const antes = estado(amb);
      const r = rodar(amb, contratoMd(amb, { harness }));
      assert.equal(r.code, 2, `${harness} ${f}: ${r.out}`);
      assert.ok(r.out.includes('HOOK_AUSENTE') && r.out.includes(f), r.out);
      assert.deepEqual(estado(amb), antes);
      limpa(amb);
    }
  }
});

test('C5 dispatch com opencode: opencode.json na pista igual byte a byte a opencode-config.json, com as permissoes do contrato', async () => {
  const { montarPermissoesOpencode } = await import('./lib/despacho.mjs');
  const { CONTROLE } = await import('./hooks/protected-paths.mjs');
  const amb = ambiente();
  const arquivo = contratoArea(amb, { harness: 'opencode' });
  const r = rodar(amb, arquivo, [], { usaFalso: 'harness-opencode.mjs' });
  assert.equal(r.code, 0, r.out);
  const naPista = readFileSync(path.join(pistaDe(amb, 'tarefa-x'), 'opencode.json'));
  assert.ok(naPista.equals(readFileSync(path.join(despacho(amb), 'opencode-config.json'))));
  const c = lerContrato(arquivo, { schemaPath: path.join(SCHEMAS, 'contrato.schema.json') });
  const esperado = montarPermissoesOpencode(c, { areas: ['packages/domain/', 'outra/area.ts'], controle: CONTROLE });
  assert.deepEqual(JSON.parse(naPista.toString('utf8')), esperado);
  assert.equal(esperado.permission.edit['outra/area.ts'], 'deny');
  assert.equal(esperado.permission.edit['packages/domain/**'], 'allow');
  assert.ok(!existsSync(path.join(pistaDe(amb, 'tarefa-x'), '.agents')));
  limpa(amb);
});

test('C5 meta.json tem hook.tipo, hook.arquivo e hook.sha256 que confere com o arquivo gravado (os tres harness)', () => {
  for (const [harness, arquivo] of [['claude', null], ['agy', ['.agents', 'hooks.json']], ['opencode', ['opencode.json']]]) {
    const amb = ambiente();
    const r = rodar(amb, contratoArea(amb, { harness }), [], { usaFalso: harness === 'agy' ? 'harness-agy.mjs' : 'harness-opencode.mjs' });
    assert.equal(r.code, 0, `${harness}: ${r.out}`);
    const { hook } = json(path.join(despacho(amb), 'meta.json'));
    assert.equal(hook.tipo, harness);
    const gravado = arquivo ? path.join(pistaDe(amb, 'tarefa-x'), ...arquivo) : path.join(despacho(amb), 'hooks-claude.json');
    assert.equal(hook.arquivo, gravado);
    assert.equal(hook.sha256, sha256(readFileSync(gravado)));
    limpa(amb);
  }
});

test('C5 nenhum dos tres harness falsos recebe OPENCODE_CONFIG_CONTENT', () => {
  for (const harness of ['claude', 'agy', 'opencode']) {
    const amb = ambiente();
    const espiao = path.join(amb.tmp, 'espiao.mjs');
    const saida = path.join(amb.tmp, 'env.txt');
    writeFileSync(espiao, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(saida)}, String('OPENCODE_CONFIG_CONTENT' in process.env));\n`);
    const { OPENCODE_CONFIG_CONTENT, ...env } = process.env;
    rodar(amb, contratoMd(amb, { harness }), ['--harness-falso', espiao], { usaFalso: null, env });
    assert.equal(readFileSync(saida, 'utf8'), 'false', harness);
    limpa(amb);
  }
  assert.doesNotMatch(readFileSync(DISPATCH, 'utf8'), /OPENCODE_CONFIG_CONTENT/);
});

// m2-h2b: o agy roda o command sem shell (sem aspas), o opencode pode ser um atalho .cmd do npm
test('C2 agy com espaco no caminho do repo ou da raiz: HOOK_CAMINHO_COM_ESPACO, saida 2, nada criado', () => {
  for (const opcoes of [{ nomeRepo: 'repo com espaco' }, { nomeRaiz: 'raiz com espaco' }]) {
    const amb = ambiente(opcoes);
    const antes = estado(amb);
    const r = rodar(amb, contratoMd(amb, { harness: 'agy' }));
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /FALHA HOOK_CAMINHO_COM_ESPACO/);
    assert.match(r.out, /agy nao entende aspas/);
    assert.deepEqual(estado(amb), antes);
    assert.ok(!existsSync(despacho(amb)) && !existsSync(pistaDe(amb)) && !existsSync(path.join(amb.raiz, '_despacho')));
    limpa(amb);
  }
});

test('C2 o mesmo repo com espaco nao barra claude nem opencode', () => {
  for (const harness of ['claude', 'opencode']) {
    const amb = ambiente({ nomeRepo: 'repo com espaco' });
    const r = rodar(amb, contratoMd(amb, { harness }), [], { usaFalso: 'harness-opencode.mjs' });
    assert.equal(r.code, 0, `${harness}: ${r.out}`);
    limpa(amb);
  }
});

const CMD_FALSO = JSON.stringify({ caminho: 'C:/npm/opencode.cmd', tipo: 'cmd' });
const comModelo = (arquivo, modelo) => writeFileSync(arquivo, readFileSync(arquivo, 'utf8').replace('"modelo": "m"', `"modelo": ${JSON.stringify(modelo)}`));

test('C5 --dry-run mostra execucao com exe e tipo (atalho .cmd e exe comum)', () => {
  const amb = ambiente();
  const arquivo = contratoMd(amb, { harness: 'opencode' });
  const r = rodar(amb, arquivo, ['--dry-run'], { usaFalso: null, env: { ...process.env, DISPATCH_RESOLVIDO_TESTE: CMD_FALSO } });
  assert.equal(r.code, 0, r.out);
  const saida = JSON.parse(r.stdout.slice(0, r.stdout.lastIndexOf('}') + 1));
  assert.deepEqual(saida.execucao, { exe: 'C:/npm/opencode.cmd', tipo: 'cmd' });
  assert.equal(saida.comando.exe, 'opencode');
  const sem = rodar(amb, arquivo, ['--dry-run'], { usaFalso: null });
  const { execucao } = JSON.parse(sem.stdout.slice(0, sem.stdout.lastIndexOf('}') + 1));
  assert.deepEqual(Object.keys(execucao), ['exe', 'tipo']);
  limpa(amb);
});

test('C5 ARGUMENTO_INSEGURO: saida 2, no dry-run e na execucao, sem criar nada', () => {
  const amb = ambiente();
  const arquivo = contratoMd(amb, { harness: 'opencode' });
  comModelo(arquivo, 'a%PATH%');
  const env = { ...process.env, DISPATCH_RESOLVIDO_TESTE: CMD_FALSO };
  for (const extra of [['--dry-run'], []]) {
    const r = rodar(amb, arquivo, extra, { usaFalso: null, env });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /FALHA ARGUMENTO_INSEGURO/);
    assert.ok(r.out.includes('a%PATH%'), r.out);
  }
  assert.deepEqual(readdirSync(amb.raiz), []);
  limpa(amb);
});

test('C5 meta.json tem exe_resolvido (harness falso passa direto)', () => {
  const amb = ambiente();
  const r = rodar(amb, contratoMd(amb));
  assert.equal(r.code, 0, r.out);
  const meta = json(path.join(despacho(amb), 'meta.json'));
  assert.equal(meta.exe_resolvido, process.execPath);
  assert.equal(meta.exe, process.execPath);
  limpa(amb);
});

// m2-j1: --gate roda o gate (falso) de fora da pista, depois do relatorio
const GATE_FALSO = falso('gate-falso.mjs');
const comGate = (amb, extra = [], env = {}, opcoes = {}) => {
  const log = path.join(amb.tmp, 'gate.log');
  const e = { ...process.env, GATE_FALSO_LOG: log, GATE_FALSO_RELATORIO: path.join(despacho(amb), 'relatorio.json'), GATE_FALSO_TRAVA: path.join(amb.raiz, '_despacho', '_trava', 'tarefa-x.lock'), ...env };
  const r = rodar(amb, contratoMd(amb), ['--gate', opcoes.gate ?? GATE_FALSO, ...extra], { env: e, ...opcoes.rodar });
  const chamadas = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  return { ...r, chamadas, log };
};
const ultima = (r) => r.out.split('\n').map((l) => l.trim()).filter((l) => /^(OK|FALHA) /.test(l)).at(-1);

test('J1 sem --gate nada muda: meta.json sem campo gate e o gate falso nunca roda', () => {
  const amb = ambiente();
  const log = path.join(amb.tmp, 'gate.log');
  const r = rodar(amb, contratoMd(amb), [], { env: { ...process.env, GATE_FALSO_LOG: log } });
  assert.equal(r.code, 0, r.out);
  assert.ok(!('gate' in json(path.join(despacho(amb), 'meta.json'))));
  assert.ok(!existsSync(log));
  limpa(amb);
});

test('J2 o gate roda uma vez, depois do relatorio, com cwd = raiz e os argumentos certos', () => {
  const amb = ambiente();
  const contrato = path.resolve(contratoMd(amb));
  const r = comGate(amb);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.chamadas.length, 1);
  const [c] = r.chamadas;
  assert.equal(c.relatorio, true);
  assert.equal(realpathSync(c.cwd), realpathSync(amb.raiz));
  assert.deepEqual(c.argv, [contrato, '--repo', amb.repo, '--raiz', amb.raiz, '--schemas', SCHEMAS, '--esperar-trava-s', '1800']);
  limpa(amb);

  const amb2 = ambiente();
  const c2 = comGate(amb2, ['--gate-so-estatico']).chamadas[0].argv;
  assert.deepEqual(c2.slice(5), ['--schemas', SCHEMAS, '--so-estatico', '--esperar-trava-s', '1800']);
  for (const proibida of ['--pista', '--relatorio', '--branch', '--saida']) assert.ok(!c2.includes(proibida));
  limpa(amb2);
});

test('C4 meta.json registra quanto o gate esperou pela trava (0 se nao esperou)', () => {
  const amb = ambiente();
  const sem = comGate(amb);
  assert.equal(sem.code, 0, sem.out);
  assert.equal(json(path.join(despacho(amb), 'meta.json')).gate.esperou_trava_s, 0);
  limpa(amb);

  const amb2 = ambiente();
  const gate = path.join(amb2.tmp, 'gate-espera.mjs');
  writeFileSync(gate, "console.error('ESPERANDO_TRAVA 5s com a trava: outro');\nconsole.error('ESPEROU_TRAVA_S 7');\n");
  const r = comGate(amb2, [], {}, { gate });
  assert.equal(r.code, 0, r.out);
  assert.equal(json(path.join(despacho(amb2), 'meta.json')).gate.esperou_trava_s, 7);
  limpa(amb2);
});

test('J3 o codigo de saida segue o veredito do gate, com uma linha final', () => {
  for (const [codigo, saida, inicio] of [[0, 0, 'OK tarefa-x GATE aprovado'], [1, 1, 'FALHA GATE_REPROVADO'], [3, 3, 'FALHA GATE_INCONCLUSIVO'], [2, 2, 'FALHA GATE_USO'], [9, 2, 'FALHA GATE_USO']]) {
    const amb = ambiente();
    const r = comGate(amb, [], { GATE_FALSO_CODIGO: String(codigo) });
    assert.equal(r.code, saida, `${codigo}: ${r.out}`);
    assert.ok(ultima(r).startsWith(inicio), `${codigo}: ${r.out}`);
    assert.equal(r.out.trim().split(/\r?\n/).filter((l) => /^(OK|FALHA) /.test(l)).length, 1, r.out);
    limpa(amb);
  }
});

test('J4 falha do dispatch antes do relatorio valido nao roda o gate', () => {
  for (const [usaFalso, env, extra, codigo] of [['harness-falha.mjs', {}, [], 1], ['harness-agy.mjs', { RELATORIO: 'relatorio-invalido.json' }, [], 1], ['harness-lento.mjs', {}, ['--timeout-ms', '300'], 1]]) {
    const amb = ambiente();
    const r = comGate(amb, extra, { PID_ARQUIVO: path.join(amb.tmp, 'pid.txt'), ...env }, { rodar: { usaFalso } });
    assert.equal(r.code, codigo, r.out);
    assert.equal(r.chamadas.length, 0);
    limpa(amb);
  }
});

test('J5 gate ausente, na pista, so-estatico sozinho e gate que nao termina', () => {
  const amb = ambiente();
  const sem = (opcoes, extra = []) => rodar(amb, contratoMd(amb), extra.length ? extra : ['--gate', opcoes.gate]);
  let r = sem({ gate: path.join(amb.tmp, 'nao-existe.mjs') });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /FALHA GATE_AUSENTE/);
  r = sem({ gate: path.join(pistaDe(amb), 'gate.mjs') });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /FALHA GATE_NA_PISTA/);
  r = sem({}, ['--gate-so-estatico']);
  assert.equal(r.code, 2, r.out);
  assert.deepEqual(readdirSync(amb.raiz), []);
  limpa(amb);

  const amb2 = ambiente();
  const pid = path.join(amb2.tmp, 'gate.pid');
  const t = comGate(amb2, ['--gate-timeout-ms', '300'], { GATE_FALSO_DORME: '1', GATE_FALSO_PID: pid });
  assert.equal(t.code, 1, t.out);
  assert.match(t.out, /FALHA GATE_TEMPO_ESGOTADO/);
  assert.throws(() => process.kill(Number(readFileSync(pid, 'utf8')), 0), 'o gate ainda esta vivo');
  assert.deepEqual(travas(amb2), []);
  limpa(amb2);
});

test('J6 meta.json registra o gate e o aviso GATE_DO_REPO', () => {
  const amb = ambiente();
  const r = comGate(amb);
  const meta = json(path.join(despacho(amb), 'meta.json'));
  assert.equal(meta.gate.caminho, GATE_FALSO);
  assert.equal(meta.gate.sha256, sha256(readFileSync(GATE_FALSO)));
  assert.equal(meta.gate.codigo, 0);
  assert.equal(meta.gate.veredito, 'aprovado');
  assert.equal(typeof meta.gate.duracao_s, 'number');
  assert.equal(path.dirname(meta.gate.gate_json), despacho(amb));
  assert.deepEqual(meta.avisos, []);
  assert.ok(!ultima(r).endsWith('[GATE_DO_REPO]'));
  limpa(amb);

  const amb2 = ambiente();
  const dentro = path.join(amb2.repo, 'gate-no-repo.mjs');
  copyFileSync(GATE_FALSO, dentro);
  const r2 = comGate(amb2, [], {}, { gate: dentro });
  assert.equal(r2.code, 0, r2.out);
  assert.deepEqual(json(path.join(despacho(amb2), 'meta.json')).avisos, ['GATE_DO_REPO']);
  assert.ok(ultima(r2).endsWith(' [GATE_DO_REPO]'), r2.out);
  limpa(amb2);
});

test('J7 --dry-run mostra o comando do gate sem criar nada nem rodar', () => {
  const amb = ambiente();
  const log = path.join(amb.tmp, 'gate.log');
  const env = { ...process.env, GATE_FALSO_LOG: log };
  const r = rodar(amb, contratoMd(amb), ['--dry-run', '--gate', GATE_FALSO], { env });
  assert.equal(r.code, 0, r.out);
  const { gate } = JSON.parse(r.stdout.slice(0, r.stdout.lastIndexOf('}') + 1));
  assert.equal(gate.exe, process.execPath);
  assert.equal(gate.args[0], GATE_FALSO);
  assert.equal(gate.cwd, amb.raiz);
  assert.deepEqual(readdirSync(amb.raiz), []);
  assert.ok(!existsSync(log));
  const sem = rodar(amb, contratoMd(amb), ['--dry-run']);
  assert.ok(!('gate' in JSON.parse(sem.stdout.slice(0, sem.stdout.lastIndexOf('}') + 1))));
  limpa(amb);
});

test('J8 a trava existe enquanto o gate roda e some depois, mesmo se ele reprovar', () => {
  for (const codigo of ['0', '1']) {
    const amb = ambiente();
    const r = comGate(amb, [], { GATE_FALSO_CODIGO: codigo });
    assert.equal(r.chamadas[0].trava, true);
    assert.deepEqual(travas(amb), []);
    limpa(amb);
  }
});

const STATS_TEXTO = 'today · all projects\n\nMODELS\nmodel                                 tokens       steps        cost\nopencode/deepseek-v4.1-flash-free…     12.2m         246       $0.00\n';
const TOKENS_CHAVES = ['entrada', 'saida', 'raciocinio', 'cache_leitura', 'cache_criacao', 'total', 'fonte'];
const comStats = (stats, extra = {}) => ({ ...process.env, ROD_STATS_FALSO: falso(stats), ...extra });
const opencodeComStats = (amb, stats, env) => rodar(amb, contratoMd(amb, { harness: 'opencode' }), [], { usaFalso: 'harness-opencode.mjs', env: comStats(stats, env) });

test('M3 opencode: os dois retratos brutos ao lado do meta.json, fonte cita os arquivos, numeros null', () => {
  const amb = ambiente();
  const r = opencodeComStats(amb, 'stats-falso.mjs');
  assert.equal(r.code, 0, r.out);
  const d = despacho(amb);
  for (const n of ['opencode-stats-antes.txt', 'opencode-stats-depois.txt']) assert.equal(readFileSync(path.join(d, n), 'utf8'), STATS_TEXTO);
  const { tokens } = json(path.join(d, 'meta.json')).meta;
  assert.match(tokens.fonte, /opencode-stats-antes\.txt.*opencode-stats-depois\.txt/);
  assert.ok(TOKENS_CHAVES.slice(0, 6).every((k) => tokens[k] === null));
  assert.deepEqual(json(path.join(d, 'meta.json')).avisos, []);
  limpa(amb);
  const outro = ambiente();
  const r2 = rodar(outro, contratoMd(outro), [], { env: comStats('stats-falso.mjs') });
  assert.equal(r2.code, 0, r2.out);
  assert.ok(!readdirSync(despacho(outro)).some((n) => n.startsWith('opencode-stats')));
  limpa(outro);
});

test('M3 opencode com harness falso e sem ROD_STATS_FALSO nao roda o stats', () => {
  const amb = ambiente();
  const r = rodar(amb, contratoMd(amb, { harness: 'opencode' }), [], { usaFalso: 'harness-opencode.mjs' });
  assert.equal(r.code, 0, r.out);
  assert.ok(!readdirSync(despacho(amb)).some((n) => n.startsWith('opencode-stats')));
  limpa(amb);
});

test('M4 stats que sai 1, que estoura o tempo e executavel ausente: aviso, mesmo codigo, sem atraso', () => {
  for (const [stats, env] of [['stats-sai1.mjs', {}], ['stats-dorme.mjs', { ROD_STATS_TIMEOUT_MS: '500' }]]) {
    const amb = ambiente();
    const t0 = Date.now();
    const r = opencodeComStats(amb, stats, env);
    assert.equal(r.code, 0, r.out);
    assert.ok(Date.now() - t0 < 20000);
    const meta = json(path.join(despacho(amb), 'meta.json'));
    assert.deepEqual(meta.avisos, ['OPENCODE_STATS_FALHOU', 'OPENCODE_STATS_FALHOU']);
    assert.equal(meta.meta.tokens.total, null);
    assert.deepEqual(travas(amb), []);
    limpa(amb);
  }
  // executavel ausente (PATH so com o git): o despacho acaba como sempre, com o aviso
  const amb = ambiente();
  const gitDir = path.dirname(execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['git'], { encoding: 'utf8' }).split(/\r?\n/)[0]);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toLowerCase() !== 'path'));
  const r = rodar(amb, contratoMd(amb, { harness: 'opencode' }), [], { usaFalso: null, env: { ...env, PATH: gitDir } });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /FALHA EXECUTAVEL_NAO_ENCONTRADO/);
  assert.ok(json(path.join(despacho(amb), 'meta.json')).avisos.includes('OPENCODE_STATS_FALHOU'));
  limpa(amb);
});

test('M6 meta.tokens com as 7 chaves nos tres harness; campos antigos do meta.meta intactos', () => {
  for (const [harness, falsoNome, fonte] of [['claude', 'harness-claude.mjs', 'claude usage'], ['agy', 'harness-agy.mjs', 'agy usage'], ['opencode', 'harness-opencode.mjs', '^opencode stats']]) {
    const amb = ambiente();
    const r = rodar(amb, contratoMd(amb, { harness }), [], { usaFalso: falsoNome });
    assert.equal(r.code, 0, r.out);
    const { tokens, ...antigos } = json(path.join(despacho(amb), 'meta.json')).meta;
    assert.deepEqual(Object.keys(tokens), TOKENS_CHAVES, harness);
    assert.deepEqual(Object.keys(antigos), ['turnos', 'custo_usd', 'duracao_ms', 'sessao']);
    if (harness === 'claude') {
      assert.deepEqual(tokens, { entrada: 10, saida: 20, raciocinio: 5, cache_leitura: 30, cache_criacao: 40, total: 100, fonte });
      assert.deepEqual(antigos, { turnos: 3, custo_usd: 0.5, duracao_ms: null, sessao: 's' });
    } else assert.match(tokens.fonte, new RegExp(fonte));
    limpa(amb);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerContrato } from './lib/contrato.mjs';
import { adquirir } from './lib/trava.mjs';

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const DISPATCH = aqui('./dispatch.mjs');
const SCHEMAS = aqui('./lib/fixtures');
const FIX = aqui('./lib/dispatch-fixtures');
const falso = (nome) => path.join(FIX, nome);
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// repositorio temporario: raiz de despacho (vazia) ao lado do repo
const ambiente = () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'dispatch-'));
  const repo = path.join(tmp, 'repo');
  const raiz = path.join(tmp, 'raiz');
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

test('P11 trava cheia: codigo 2 sem criar pista; com --max-simultaneas 3 roda', () => {
  const amb = ambiente();
  const arquivo = contratoMd(amb);
  for (const id of ['o1', 'o2']) assert.ok(adquirir({ raiz: amb.raiz, id, minutos: 40, max: 2 }).ok);
  const r = rodar(amb, arquivo);
  assert.equal(r.code, 2);
  assert.match(r.out, /FALHA TRAVA_CHEIA/);
  assert.ok(!existsSync(path.join(amb.raiz, 'pistas')));
  assert.ok(!existsSync(despacho(amb)));
  const r3 = rodar(amb, arquivo, ['--max-simultaneas', '3']);
  assert.equal(r3.code, 0, r3.out);
  limpa(amb);
});

test('P12 nada fora da pista e de _despacho; contrato deste bloco e valido', () => {
  const amb = ambiente();
  assert.equal(rodar(amb, contratoMd(amb)).code, 0);
  assert.equal(git(amb.repo, 'status', '--short'), '');
  assert.deepEqual(readdirSync(amb.raiz).sort(), ['_despacho', 'pistas']);
  assert.deepEqual(readdirSync(despacho(amb)).sort(), ['autorizacao.json', 'meta.json', 'relatorio.json', 'relatorio.schema.json', 'saida.txt', 'stderr.txt']);
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
  for (const [harness, ligado] of [['claude', true], ['agy', false], ['opencode', false]]) {
    const amb = ambiente();
    const r = rodar(amb, contratoMd(amb, { harness }), ['--dry-run'], { usaFalso: null });
    assert.equal(r.code, 0, r.out);
    const { plano, comando } = JSON.parse(r.stdout.slice(0, r.stdout.lastIndexOf('}') + 1));
    assert.equal(comando.args.includes('--settings'), ligado);
    if (ligado) {
      assert.deepEqual(plano.hook, { ligado: true, settings: path.join(despacho(amb), 'hooks-claude.json') });
      assert.equal(comando.args[comando.args.indexOf('--settings') + 1], plano.hook.settings);
      assert.ok(comando.args.indexOf('--settings') < comando.args.indexOf('--allowedTools'));
    } else assert.deepEqual(plano.hook, { ligado: false, motivo: 'harness sem hook ligado (h2)' });
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

test('B3 vale no dry-run; agy e opencode nao sao afetados', () => {
  const amb = ambiente();
  semHook(amb);
  assert.equal(rodar(amb, contratoMd(amb, { harness: 'claude' }), ['--dry-run'], { usaFalso: null }).code, 2);
  for (const harness of ['agy', 'opencode']) {
    const r = rodar(amb, contratoMd(amb, { harness }), ['--dry-run'], { usaFalso: null });
    assert.equal(r.code, 0, r.out);
    assert.equal(JSON.parse(r.stdout.slice(0, r.stdout.lastIndexOf('}') + 1)).plano.hook.ligado, false);
  }
  limpa(amb);
});

test('B4 com o script presente o dry-run do claude devolve o plano de sempre', () => {
  const amb = ambiente();
  const r = rodar(amb, contratoMd(amb, { harness: 'claude' }), ['--dry-run'], { usaFalso: null });
  assert.equal(r.code, 0, r.out);
  const { plano } = JSON.parse(r.stdout.slice(0, r.stdout.lastIndexOf('}') + 1));
  assert.deepEqual(plano.hook, { ligado: true, settings: path.join(despacho(amb), 'hooks-claude.json') });
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

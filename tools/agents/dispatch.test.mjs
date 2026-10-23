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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const RODAR = aqui('./rodar.mjs');
const SCHEMAS = aqui('./lib/fixtures');
const FALSO = aqui('./lib/rodar-fixtures/dispatch-falso.mjs');

// raiz de teste: docs/contratos, _gate-bin/VIGENTE.txt e a copia do gate; o repo e o deste worktree (so lido)
const ambiente = ({ vigente = 'abc1234\n', gate = true } = {}) => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'rodar-'));
  const raiz = path.join(tmp, 'raiz');
  mkdirSync(raiz);
  const docs = path.join(tmp, 'docs');
  mkdirSync(path.join(docs, 'v1', 'contratos'), { recursive: true });
  mkdirSync(path.join(tmp, 'gatebin'));
  if (vigente !== null) writeFileSync(path.join(tmp, 'gatebin', 'VIGENTE.txt'), vigente);
  const raizComGate = path.join(tmp, 'raizgate');
  return { tmp, raiz, docs, vigente: path.join(tmp, 'gatebin', 'VIGENTE.txt'), raizComGate, gate };
};

const contrato = (amb, { id = 'tarefa-x', harness = 'claude', commit = 'abc1234', sem } = {}) => {
  const cab = {
    id, modo: 'agente normal', executor: { harness, modelo: 'sonnet' }, base: { branch: 'main', commit }, pista: 'pista-x',
    arquivos_permitidos: ['feito.txt', 'b.txt'], areas_autorizadas: ['area/'], comandos_validacao: ['node --test'],
    limites: { turnos: 20, minutos: 20 }, criterios: ['C1 um'],
  };
  if (sem) delete cab[sem];
  writeFileSync(path.join(amb.docs, 'v1', 'contratos', `${id}.md`), `# c\n\n\`\`\`json contrato\n${JSON.stringify(cab, null, 2)}\n\`\`\`\n`);
};

const rodar = (amb, args, { input = '', env = {}, raiz = amb.raiz } = {}) => {
  const log = path.join(amb.tmp, 'dispatch.log');
  const r = spawnSync(process.execPath, [RODAR, ...args, '--raiz', raiz, '--docs', amb.docs, '--schemas', SCHEMAS, '--gate-vigente', amb.vigente], {
    encoding: 'utf8', input, timeout: 60000, env: { ...process.env, RODAR_DISPATCH_TESTE: FALSO, RODAR_FALSO_LOG: log, ...env },
  });
  const chamadas = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { code: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout, chamadas };
};

// a raiz com a copia do gate vigente (abc1234)
const comGate = (amb) => {
  const dir = path.join(amb.raizComGate, '_gate-bin', 'abc1234', 'tools', 'agents');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'gate.mjs'), '');
  return amb.raizComGate;
};

const limpa = (amb) => rmSync(amb.tmp, { recursive: true, force: true });

test('L1 o id vira contrato, schemas, gate e argumentos do dispatch', () => {
  const amb = ambiente();
  contrato(amb);
  const raiz = comGate(amb);
  const r = rodar(amb, ['tarefa-x', '--sim'], { raiz });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.chamadas.length, 1);
  const a = r.chamadas[0];
  assert.equal(a[0], path.join(amb.docs, 'v1', 'contratos', 'tarefa-x.md'));
  assert.equal(a[1], '--repo');
  assert.equal(path.resolve(a[2]), path.resolve(aqui('../../')));
  assert.deepEqual(a.slice(3), ['--raiz', raiz, '--schemas', SCHEMAS, '--gate', path.join(raiz, '_gate-bin', 'abc1234', 'tools', 'agents', 'gate.mjs')]);
  limpa(amb);
});

test('L2 id, contrato, cabecalho e base invalidos: codigo 2, nada criado, dispatch nao chamado', () => {
  const amb = ambiente();
  contrato(amb);
  contrato(amb, { id: 'sem-executor', sem: 'executor' });
  contrato(amb, { id: 'base-zero', commit: '0000000' });
  const caso = (args, codigo, texto) => {
    const r = rodar(amb, args);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, new RegExp(codigo), r.out);
    if (texto) assert.match(r.out, texto);
    assert.equal(r.chamadas.length, 0);
  };
  caso(['Maiuscula'], 'ID_INVALIDO');
  caso(['../x'], 'ID_INVALIDO');
  caso(['nao-existe'], 'CONTRATO_AUSENTE');
  caso(['sem-executor'], 'CONTRATO_INVALIDO', /executor/);
  caso(['base-zero'], 'BASE_NAO_PREENCHIDA');
  assert.deepEqual(readdirSync(amb.raiz), []);
  limpa(amb);
});

test('L3 gate vigente ausente, invalido, sem pasta e com espacos', () => {
  const sem = ambiente({ vigente: null });
  contrato(sem);
  let r = rodar(sem, ['tarefa-x', '--sim']);
  assert.equal(r.code, 2);
  assert.match(r.out, /GATE_VIGENTE_AUSENTE/);
  limpa(sem);

  const ruim = ambiente({ vigente: 'xyz' });
  contrato(ruim);
  r = rodar(ruim, ['tarefa-x', '--sim']);
  assert.equal(r.code, 2);
  assert.match(r.out, /GATE_VIGENTE_INVALIDO/);
  limpa(ruim);

  const amb = ambiente({ vigente: '  abc1234  \r\n\r\n' });
  contrato(amb);
  r = rodar(amb, ['tarefa-x', '--sim']);
  assert.equal(r.code, 2);
  assert.match(r.out, /GATE_AUSENTE/);
  r = rodar(amb, ['tarefa-x', '--sim'], { raiz: comGate(amb) });
  assert.equal(r.code, 0, r.out);
  limpa(amb);
});

test('L4 o resumo antes de despachar sai com os valores do contrato', () => {
  const amb = ambiente();
  contrato(amb);
  const r = rodar(amb, ['tarefa-x', '--sim'], { raiz: comGate(amb) });
  for (const t of ['Tarefa:', 'tarefa-x', 'claude (sonnet)', 'gasta o limite de 5 h do Claude', '20 turnos, 20 minutos', '2 permitidos, 1 areas protegidas autorizadas', 'copia confiavel abc1234', 'ENTER para despachar']) assert.ok(r.stdout.includes(t), t);
  contrato(amb, { id: 'tarefa-y', harness: 'opencode' });
  assert.match(rodar(amb, ['tarefa-y', '--sim'], { raiz: comGate(amb) }).stdout, /gratis \(limite invisivel do provedor\)/);
  limpa(amb);
});

test('L5 sem --sim: entrada fechada cancela, linha vazia despacha, --sim nao le a entrada', () => {
  const amb = ambiente();
  contrato(amb);
  const raiz = comGate(amb);
  let r = rodar(amb, ['tarefa-x'], { raiz, input: '' });
  assert.equal(r.code, 1);
  assert.match(r.out, /CANCELADO/);
  assert.equal(r.chamadas.length, 0);
  r = rodar(amb, ['tarefa-x'], { raiz, input: '\n' });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.chamadas.length, 1);
  r = rodar(amb, ['tarefa-x', '--sim'], { raiz, input: '' });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.chamadas.length, 2);
  limpa(amb);
});

test('L6 --dry-run: codigo 0, resumo, sem ler entrada, dispatch so com --dry-run', () => {
  const amb = ambiente();
  contrato(amb);
  const raiz = comGate(amb);
  const r = rodar(amb, ['tarefa-x', '--dry-run'], { raiz, input: '' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /Tarefa:/);
  assert.doesNotMatch(r.stdout, /Veredito/);
  assert.equal(r.chamadas.length, 1);
  assert.equal(r.chamadas[0].at(-1), '--dry-run');
  assert.equal(r.chamadas[0].filter((x) => x === '--dry-run').length, 1);
  assert.deepEqual(readdirSync(raiz).filter((n) => n !== '_gate-bin'), []);
  limpa(amb);
});

test('L7 --so-estatico vira --gate-so-estatico e o codigo do dispatch e repassado', () => {
  const amb = ambiente();
  contrato(amb);
  const raiz = comGate(amb);
  let r = rodar(amb, ['tarefa-x', '--sim', '--so-estatico'], { raiz });
  assert.equal(r.chamadas[0].at(-1), '--gate-so-estatico');
  assert.equal(r.chamadas[0].at(-3), '--gate');
  for (const c of [0, 1, 2, 3]) {
    r = rodar(amb, ['tarefa-x', '--sim'], { raiz, env: { RODAR_FALSO_CODIGO: String(c) } });
    assert.equal(r.code, c, r.out);
    assert.match(r.stdout, new RegExp(`Veredito: ${{ 0: 'APROVADO', 1: 'FALHOU', 2: 'USO ERRADO', 3: 'INCONCLUSIVO' }[c]}`));
  }
  limpa(amb);
});

test('L8 o resumo final le meta.json e gate.json da raiz', () => {
  const amb = ambiente();
  contrato(amb);
  const raiz = comGate(amb);
  const dir = path.join(raiz, '_despacho', 'tarefa-x');
  mkdirSync(dir, { recursive: true });
  let r = rodar(amb, ['tarefa-x', '--sim'], { raiz });
  assert.match(r.stdout, /Sem meta\.json/);
  writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ duracao_s: 12.5, meta: { turnos: 4, custo_usd: null } }));
  writeFileSync(path.join(dir, 'gate.json'), '{}');
  r = rodar(amb, ['tarefa-x', '--sim'], { raiz, env: { RODAR_FALSO_CODIGO: '1' } });
  assert.match(r.stdout, /Veredito: REPROVADO/);
  assert.match(r.stdout, /Duracao: 12\.5 s/);
  assert.match(r.stdout, /Turnos: 4/);
  assert.match(r.stdout, /Meta: .*meta\.json/);
  assert.doesNotMatch(r.stdout, /Custo|Relatorio:|undefined|null|NaN/);
  limpa(amb);
});

test('L9 rodar.ps1 tem 4 linhas e toda saida e ASCII', () => {
  assert.equal(readFileSync(aqui('./rodar.ps1'), 'utf8').trimEnd().split(/\r?\n/).join('\n'), "#requires -Version 7\n$ErrorActionPreference = 'Stop'\nnode \"$PSScriptRoot/rodar.mjs\" @args\nexit $LASTEXITCODE");
  const amb = ambiente();
  contrato(amb);
  const raiz = comGate(amb);
  const saidas = [
    rodar(amb, ['Maiuscula']), rodar(amb, ['café']), rodar(amb, ['nao-existe']), rodar(amb, ['tarefa-x', '--sim'], { raiz }),
    rodar(amb, ['tarefa-x'], { raiz, input: '' }), rodar(amb, ['tarefa-x', '--dry-run'], { raiz }), rodar(amb, ['--invalida']),
  ];
  for (const s of saidas) assert.match(s.out, /^[\x00-\x7F]*$/, s.out);
  limpa(amb);
});

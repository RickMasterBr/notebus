import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

// ---- m2-l2: registro, arquivo e percentual (trace real, dispatch falso) ----
const TRACE_FALSO = aqui('./lib/rodar-fixtures/trace-falso.mjs');
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

// ambiente pronto: contrato, gate e os JSON que o despacho deixaria em _despacho/<id>
const pronto = (id = 'tarefa-x') => {
  const amb = ambiente();
  contrato(amb, { id });
  const raiz = comGate(amb);
  const dir = path.join(raiz, '_despacho', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ id, harness: 'claude', inicio: '2026-01-01T10:00:00Z', fim: '2026-01-01T10:05:00Z', duracao_s: 300 }));
  writeFileSync(path.join(dir, 'relatorio.json'), JSON.stringify({ tarefa: id, resultado: 'ok', arquivos_mudados: ['feito.txt'], comandos: [] }));
  return { amb, raiz, dir, csv: path.join(amb.tmp, 'reg.csv'), registros: path.join(amb.tmp, 'registros') };
};
const registra = (p, args = [], opts = {}) => rodar(p.amb, ['tarefa-x', '--sim', '--csv', p.csv, '--registros', p.registros, ...args], { raiz: p.raiz, ...opts });
// valor da coluna da ultima linha do csv
const celula = (p, coluna) => {
  const [cab, ...linhas] = readFileSync(p.csv, 'utf8').trim().split('\n');
  return linhas.at(-1).split(',')[cab.split(',').indexOf(coluna)];
};
const arq = (p) => path.join(p.registros, 'arquivo');

test('R1 depois do despacho existem o registro .md e a linha do csv', () => {
  // sem _despacho pre-criado: so o dispatch falso o cria, entao o registro so mostra 4242 se vier depois
  const amb = ambiente();
  contrato(amb);
  const raiz = comGate(amb);
  const p = { amb, raiz, csv: path.join(amb.tmp, 'reg.csv'), registros: path.join(amb.tmp, 'registros') };
  assert.ok(!existsSync(path.join(raiz, '_despacho')));
  const r = registra(p, [], { env: { RODAR_FALSO_GRAVA: '1' } });
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(path.join(p.registros, 'tarefa-x.md')));
  assert.match(readFileSync(p.csv, 'utf8'), /^tarefa-x,/m);
  assert.equal(celula(p, 'duracao_harness_s'), '4242');
  assert.match(r.stdout, /Registro: .*tarefa-x\.md/);
  limpa(p.amb);
});

test('R2 o arquivo tem copias identicas, o original fica e ausente nao da erro', () => {
  const p = pronto();
  const r = registra(p);
  assert.equal(r.code, 0, r.out);
  for (const n of ['relatorio.json', 'meta.json']) {
    assert.equal(sha(path.join(arq(p), 'tarefa-x', n)), sha(path.join(p.dir, n)));
  }
  assert.deepEqual(readdirSync(path.join(arq(p), 'tarefa-x')).sort(), ['meta.json', 'relatorio.json']);
  assert.deepEqual(readdirSync(p.dir).sort(), ['meta.json', 'relatorio.json']);
  assert.doesNotMatch(r.out, /AVISO/);
  limpa(p.amb);
});

test('R3 segunda rodada do mesmo id usa --2 e nao mexe na primeira', () => {
  const p = pronto();
  registra(p);
  const antes = sha(path.join(arq(p), 'tarefa-x', 'meta.json'));
  writeFileSync(path.join(p.dir, 'meta.json'), JSON.stringify({ id: 'tarefa-x', harness: 'claude', inicio: '2026-02-02T10:00:00Z', duracao_s: 9 }));
  const r = registra(p);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readdirSync(arq(p)).filter((n) => n !== 'LEIA-ME.md').sort(), ['tarefa-x', 'tarefa-x--2']);
  assert.equal(sha(path.join(arq(p), 'tarefa-x', 'meta.json')), antes);
  assert.equal(sha(path.join(arq(p), 'tarefa-x--2', 'meta.json')), sha(path.join(p.dir, 'meta.json')));
  limpa(p.amb);
});

test('R4 LEIA-ME existe, diz NAO LER, e ASCII e nao e reescrito', () => {
  const p = pronto();
  registra(p);
  const f = path.join(arq(p), 'LEIA-ME.md');
  const texto = readFileSync(f, 'utf8');
  assert.match(texto, /NAO LER/);
  assert.match(texto, /^[\x00-\x7F]*$/);
  const t0 = statSync(f).mtimeMs;
  registra(p);
  assert.equal(statSync(f).mtimeMs, t0);
  limpa(p.amb);
});

test('R5 pergunta o percentual: virgula, vazio, invalido uma vez, fora da faixa', () => {
  const caso = (input, esperado, avisa) => {
    const p = pronto();
    const r = rodar(p.amb, ['tarefa-x', '--csv', p.csv, '--registros', p.registros], { raiz: p.raiz, input });
    assert.equal(r.code, 0, r.out);
    assert.match(r.stdout, /Quanto % do limite gastou\?/);
    assert.equal(celula(p, 'pct_limite'), esperado, r.out);
    if (avisa) assert.match(r.out, /AVISO percentual nao anotado/);
    limpa(p.amb);
  };
  caso('\n12,5\n', '13');
  caso('\n12.4\n', '12');
  caso('\n\n', '');
  caso('\nabc\n7\n', '7');
  caso('\nabc\nxyz\n', '', true);
  caso('\n150\n', '', true);
});

test('R6 --pct nao pergunta e anota; --sem-registro nao cria nada', () => {
  let p = pronto();
  let r = rodar(p.amb, ['tarefa-x', '--pct', '3', '--csv', p.csv, '--registros', p.registros], { raiz: p.raiz, input: '\n' });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /Quanto %/);
  assert.equal(celula(p, 'pct_limite'), '3');
  limpa(p.amb);
  p = pronto();
  r = rodar(p.amb, ['tarefa-x', '--sem-registro', '--csv', p.csv, '--registros', p.registros], { raiz: p.raiz, input: '\n' });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.stdout, /Quanto %|Registro:|Arquivo:/);
  assert.equal(existsSync(p.csv), false);
  assert.equal(existsSync(p.registros), false);
  assert.equal(r.out.includes('AVISO'), false);
  limpa(p.amb);
});

test('R7 falha do trace ou da copia vira aviso e nao muda o codigo de saida', () => {
  let p = pronto();
  for (const c of [0, 1, 3]) {
    const r = registra(p, [], { env: { RODAR_TRACE_TESTE: TRACE_FALSO, RODAR_FALSO_CODIGO: String(c) } });
    assert.equal(r.code, c, r.out);
    assert.match(r.out, /AVISO registro nao gerado \(1\)/);
  }
  limpa(p.amb);
  p = pronto();
  mkdirSync(p.registros);
  writeFileSync(path.join(p.registros, 'arquivo'), 'arquivo comum no lugar da pasta');
  const r = registra(p, [], { env: { RODAR_FALSO_CODIGO: '1' } });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /AVISO arquivo nao guardado \(\w+\)/);
  assert.equal(r.out.split('\n').filter((l) => l.includes('arquivo nao guardado')).length, 1);
  limpa(p.amb);
});

test('R8 --dry-run, id invalido e contrato ausente nao registram nem arquivam', () => {
  const p = pronto();
  for (const args of [['tarefa-x', '--dry-run'], ['Maiuscula'], ['nao-existe']]) {
    const r = rodar(p.amb, [...args, '--csv', p.csv, '--registros', p.registros], { raiz: p.raiz });
    assert.ok(r.code === 0 || r.code === 2, r.out);
    assert.doesNotMatch(r.stdout, /Quanto %/);
  }
  assert.equal(existsSync(p.csv), false);
  assert.equal(existsSync(p.registros), false);
  limpa(p.amb);
});

// ---- v1-infra-07: limites de concorrencia deixam de parecer uso errado ----

// dispatch falso pelo gancho RODAR_DISPATCH_TESTE: escreve o texto no stderr e sai com o codigo
const dispatchFalha = (amb, texto, codigo = 2) => {
  const arq = path.join(amb.tmp, `dispatch-falha-${codigo}.mjs`);
  writeFileSync(arq, `process.stderr.write(${JSON.stringify(texto)});\nprocess.exit(${codigo});\n`);
  return arq;
};

// como rodar(), mas guarda stdout e stderr separados para provar o repasse byte a byte
const rodarStreams = (amb, args, { input = '', env = {}, raiz = amb.raiz } = {}) => {
  const log = path.join(amb.tmp, 'dispatch.log');
  const r = spawnSync(process.execPath, [RODAR, ...args, '--raiz', raiz, '--docs', amb.docs, '--schemas', SCHEMAS, '--gate-vigente', amb.vigente], {
    encoding: 'utf8', input, timeout: 60000, env: { ...process.env, RODAR_DISPATCH_TESTE: FALSO, RODAR_FALSO_LOG: log, ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, out: `${r.stdout}${r.stderr}` };
};

test('L10 TRAVA_CHEIA: stderr inteiro no terminal, veredito e proximo passo, sem registro', () => {
  const p = pronto();
  const stderr = 'FALHA TRAVA_CHEIA ativos: tarefa-a, tarefa-b\nlinha seguinte\n';
  const r = rodarStreams(p.amb, ['tarefa-x', '--sim', '--csv', p.csv, '--registros', p.registros], { raiz: p.raiz, env: { RODAR_DISPATCH_TESTE: dispatchFalha(p.amb, stderr) } });
  assert.equal(r.code, 2, r.out);
  assert.equal(r.stderr, stderr);
  assert.match(r.stdout, /Veredito: DESPACHOS EM ANDAMENTO/);
  assert.match(r.stdout, /Proximo passo: ha 3 despachos em andamento; espere um terminar e rode de novo \.\\notebus\\tools\\agents\\rodar\.ps1 tarefa-x/);
  assert.equal(existsSync(p.csv), false);
  assert.equal(existsSync(p.registros), false);
  limpa(p.amb);
});

test('L11 GATE_OCUPADO vem do stderr do dispatch ou do gate-stderr.txt', () => {
  let p = pronto();
  writeFileSync(path.join(p.dir, 'gate-stderr.txt'), 'FALHA GATE_OCUPADO outro gate em andamento (tarefa-y)\n');
  let r = rodarStreams(p.amb, ['tarefa-x', '--sim'], { raiz: p.raiz, env: { RODAR_DISPATCH_TESTE: dispatchFalha(p.amb, 'saida do dispatch sem a linha\n') } });
  assert.equal(r.code, 2, r.out);
  assert.equal(r.stderr, 'saida do dispatch sem a linha\n');
  assert.match(r.stdout, /Veredito: GATE OCUPADO/);
  assert.match(r.stdout, /Proximo passo: espere o outro gate terminar e rode \.\\_gate-bin\\regate\.ps1 tarefa-x/);
  limpa(p.amb);

  p = pronto();
  r = rodarStreams(p.amb, ['tarefa-x', '--sim'], { raiz: p.raiz, env: { RODAR_DISPATCH_TESTE: dispatchFalha(p.amb, 'FALHA GATE_OCUPADO outro gate em andamento (tarefa-y)\n') } });
  assert.equal(r.code, 2, r.out);
  assert.match(r.stdout, /Veredito: GATE OCUPADO/);
  limpa(p.amb);
});

test('L12 a linha FALHA so muda o veredito com codigo 2', () => {
  let p = pronto();
  let r = rodarStreams(p.amb, ['tarefa-x', '--sim', '--sem-registro'], { raiz: p.raiz, env: { RODAR_DISPATCH_TESTE: dispatchFalha(p.amb, 'FALHA GATE_OCUPADO outro gate em andamento\n', 1) } });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /Veredito: FALHOU/);
  assert.match(r.stdout, /Proximo passo: avise a coordenacao que terminou/);
  limpa(p.amb);

  p = pronto();
  r = rodarStreams(p.amb, ['tarefa-x', '--sim'], { raiz: p.raiz, env: { RODAR_DISPATCH_TESTE: dispatchFalha(p.amb, 'qualquer coisa no stderr\n') } });
  assert.equal(r.code, 2, r.out);
  assert.equal(r.stderr, 'qualquer coisa no stderr\n');
  assert.match(r.stdout, /Veredito: USO ERRADO/);
  assert.match(r.stdout, /Proximo passo: avise a coordenacao que terminou/);
  limpa(p.amb);
});

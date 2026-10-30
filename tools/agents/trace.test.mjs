import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLUNAS, ler } from './lib/csv.mjs';
import { semanaIso } from './lib/resumo.mjs';
import { removerJuncao } from './lib/juncao.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const TRACE = path.join(aqui, 'trace.mjs');
const FX = path.join(aqui, 'lib', 'trace-fixtures');
const COMPLETO = path.join(FX, 'contrato-completo.md');
const SEM_GATE = path.join(FX, 'contrato-sem-gate.md');
const col = (l, nome) => l[COLUNAS.indexOf(nome)];
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

const rodar = (...args) => {
  const r = spawnSync(process.execPath, [TRACE, ...args], { encoding: 'utf8' });
  return { codigo: r.status, out: r.stdout, err: r.stderr };
};
const pasta = () => mkdtempSync(path.join(os.tmpdir(), 'trace-'));
const ambiente = () => {
  const T = pasta();
  return { T, csv: path.join(T, 'reg', 'registro-execucao.csv'), regs: path.join(T, 'registros') };
};
const trace = (a, contrato = COMPLETO, ...extra) => rodar(contrato, '--raiz', FX, '--csv', a.csv, '--registros', a.regs, ...extra);
const linhasDe = (csv) => ler(readFileSync(csv, 'utf8')).linhas;
const arvore = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).sort() : []);

test('C5 cabecalho antigo de 22 colunas: CSV_CABECALHO e o arquivo fica byte a byte igual', () => {
  const a = ambiente();
  mkdirSync(path.dirname(a.csv), { recursive: true });
  writeFileSync(a.csv, COLUNAS.slice(0, 22).join(',') + '\n');
  const antes = readFileSync(a.csv);
  const r = trace(a);
  assert.equal(r.codigo, 2);
  assert.match(r.err, /CSV_CABECALHO/);
  assert.deepEqual(readFileSync(a.csv), antes);
});

test('T2 CLI: despacho completo gera uma linha de 25 colunas e o esqueleto', () => {
  const a = ambiente();
  const r = trace(a);
  assert.equal(r.codigo, 0, r.err);
  const [l, ...mais] = linhasDe(a.csv);
  assert.equal(mais.length, 0);
  assert.equal(l.length, 25);
  assert.equal(col(l, 'modelo'), 'sonnet');
  assert.equal(col(l, 'rodadas_verificacao'), '2'); // dois arquivos em gate-historico
  assert.equal(col(l, 'verificacoes_falhas'), 'G04|G10');
  assert.equal(col(l, 'pct_limite') + col(l, 'retrabalho'), '');
  assert.ok(existsSync(path.join(a.regs, 'tarefa-completa.md')));
});

test('T3 idempotente: mesma execucao nao duplica; outro inicio acrescenta; cabecalho uma vez; linhas antigas intactas', () => {
  const a = ambiente();
  trace(a);
  const antes = readFileSync(a.csv);
  const r2 = trace(a);
  assert.equal(r2.codigo, 0);
  assert.match(r2.err, /JA_REGISTRADO/);
  assert.deepEqual(readFileSync(a.csv), antes);

  // outro inicio: copia o despacho para uma raiz temporaria com meta.json alterado
  const raiz = pasta();
  cpSync(FX, raiz, { recursive: true });
  const metaArq = path.join(raiz, '_despacho', 'tarefa-completa', 'meta.json');
  writeFileSync(metaArq, readFileSync(metaArq, 'utf8').replace('2026-10-20T10:00:00.000Z', '2026-10-27T10:00:00.000Z'));
  const r3 = rodar(COMPLETO, '--raiz', raiz, '--csv', a.csv, '--registros', a.regs);
  assert.equal(r3.codigo, 0, r3.err);
  const depois = readFileSync(a.csv);
  assert.deepEqual(depois.subarray(0, antes.length), antes);
  assert.equal(linhasDe(a.csv).length, 2);
  assert.equal(depois.toString('utf8').split('tarefa,executor').length - 1, 1);
});

test('T3 acrescenta mesmo quando o arquivo existente nao termina em quebra de linha', () => {
  const a = ambiente();
  trace(a, SEM_GATE);
  const texto = readFileSync(a.csv, 'utf8');
  writeFileSync(a.csv, texto.replace(/\n$/, ''));
  assert.equal(trace(a, COMPLETO).codigo, 0);
  assert.equal(linhasDe(a.csv).length, 2);
});

test('T4 sem gate: sem_gate, 0 rodadas, colunas do gate vazias, codigo 0', () => {
  const a = ambiente();
  const r = trace(a, SEM_GATE);
  assert.equal(r.codigo, 0, r.err);
  const [l] = linhasDe(a.csv);
  assert.equal(col(l, 'resultado_gate'), 'sem_gate');
  assert.equal(col(l, 'rodadas_verificacao'), '0');
  assert.equal(col(l, 'modelo'), 'gemini');
  for (const n of ['inicio_gate', 'fim_gate', 'exige_revisor', 'avisos_gate', 'verificacoes_falhas', 'divergencias']) assert.equal(col(l, n), '', n);
  assert.ok(readFileSync(path.join(a.regs, 'tarefa-sem-gate.md'), 'utf8').includes('## Gate\n\nsem gate\n'));
});

test('T6 registro existente nunca e sobrescrito; --so-csv nao cria registro', () => {
  const a = ambiente();
  mkdirSync(a.regs, { recursive: true });
  const reg = path.join(a.regs, 'tarefa-completa.md');
  writeFileSync(reg, '# veredito do Rick\nficou bom\n');
  const hash = sha(reg);
  const r = trace(a);
  assert.equal(r.codigo, 0, r.err);
  assert.match(r.err, /REGISTRO_EXISTE/);
  assert.equal(sha(reg), hash);
  assert.equal(linhasDe(a.csv).length, 1); // o csv foi escrito mesmo assim

  const b = ambiente();
  const r2 = rodar(COMPLETO, '--raiz', FX, '--csv', b.csv, '--so-csv');
  assert.equal(r2.codigo, 0, r2.err);
  assert.equal(linhasDe(b.csv).length, 1);
  assert.ok(!existsSync(b.regs));
});

test('T7 anotar: so a coluna pedida, so a linha mais recente do id', () => {
  const a = ambiente();
  trace(a, COMPLETO);
  trace(a, SEM_GATE);
  const raiz = pasta();
  cpSync(FX, raiz, { recursive: true });
  const metaArq = path.join(raiz, '_despacho', 'tarefa-completa', 'meta.json');
  writeFileSync(metaArq, readFileSync(metaArq, 'utf8').replace('2026-10-20T10:00:00.000Z', '2026-10-27T10:00:00.000Z'));
  rodar(COMPLETO, '--raiz', raiz, '--csv', a.csv, '--registros', a.regs); // 2a linha de tarefa-completa
  const antes = linhasDe(a.csv);
  assert.equal(antes.length, 3);

  const r = rodar('anotar', 'tarefa-completa', '--csv', a.csv, '--pct', '4');
  assert.equal(r.codigo, 0, r.err);
  const depois = linhasDe(a.csv);
  antes.forEach((l, i) => l.forEach((c, j) => {
    const mudou = i === 2 && COLUNAS[j] === 'pct_limite';
    assert.equal(depois[i][j], mudou ? '4' : c, `linha ${i} ${COLUNAS[j]}`);
  }));

  assert.equal(rodar('anotar', 'tarefa-sem-gate', '--csv', a.csv, '--retrabalho', '2', '--intervencoes', '1', '--mutantes', '0').codigo, 0);
  const l = linhasDe(a.csv)[1];
  assert.deepEqual([col(l, 'retrabalho'), col(l, 'intervencoes_rick'), col(l, 'mutantes_sobreviventes'), col(l, 'pct_limite')], ['2', '1', '0', '']);
});

test('T7 anotar: --pct invalido, id inexistente, csv ausente, sem flag: codigo 2 sem alterar', () => {
  const a = ambiente();
  trace(a);
  const hash = sha(a.csv);
  for (const args of [['anotar', 'tarefa-completa', '--csv', a.csv, '--pct', 'abc'], ['anotar', 'nao-existe', '--csv', a.csv, '--pct', '1'], ['anotar', 'tarefa-completa', '--csv', a.csv], ['anotar', 'tarefa-completa', '--csv', a.csv, '--pct', '-1']]) {
    const r = rodar(...args);
    assert.equal(r.codigo, 2, args.join(' '));
    assert.match(r.err, /^FALHA [A-Z_]+ /);
  }
  assert.equal(sha(a.csv), hash);
  const ausente = path.join(a.T, 'nao-existe.csv');
  assert.equal(rodar('anotar', 'x', '--csv', ausente, '--pct', '1').codigo, 2);
  assert.ok(!existsSync(ausente));
});

test('T8 uso errado e entradas ruins: codigo 2, FALHA <CODIGO>, nada criado', () => {
  const a = ambiente();
  const vazio = pasta();
  const semRelatorio = pasta();
  mkdirSync(path.join(semRelatorio, '_despacho', 'tarefa-completa'), { recursive: true });
  copyFileSync(path.join(FX, '_despacho', 'tarefa-completa', 'meta.json'), path.join(semRelatorio, '_despacho', 'tarefa-completa', 'meta.json'));
  const quebrado = pasta();
  cpSync(FX, quebrado, { recursive: true });
  writeFileSync(path.join(quebrado, '_despacho', 'tarefa-completa', 'relatorio.json'), '{ nao e json');
  const gateV2 = pasta();
  cpSync(FX, gateV2, { recursive: true });
  const g = path.join(gateV2, '_despacho', 'tarefa-completa', 'gate.json');
  writeFileSync(g, readFileSync(g, 'utf8').replace('"versao": 1', '"versao": 2'));
  const csvRuim = path.join(a.T, 'ruim.csv');
  writeFileSync(csvRuim, 'a,b\n1,2\n');

  const casos = [
    [[], 'USO'],
    [[COMPLETO], 'USO'],
    [[COMPLETO, '--raiz', FX, '--csv', a.csv], 'USO'],
    [[COMPLETO, '--raiz', FX, '--csv', a.csv, '--registros', a.regs, '--nao-existe'], 'USO'],
    [[COMPLETO, '--raiz', FX, '--csv', a.csv, '--registros'], 'USO'],
    [[path.join(FX, 'resumo.csv'), '--raiz', FX, '--csv', a.csv, '--registros', a.regs], 'CONTRATO_INVALIDO'],
    [[COMPLETO, '--raiz', vazio, '--csv', a.csv, '--registros', a.regs], 'SEM_META'],
    [[COMPLETO, '--raiz', semRelatorio, '--csv', a.csv, '--registros', a.regs], 'SEM_RELATORIO'],
    [[COMPLETO, '--raiz', quebrado, '--csv', a.csv, '--registros', a.regs], 'RELATORIO_ILEGIVEL'],
    [[COMPLETO, '--raiz', gateV2, '--csv', a.csv, '--registros', a.regs], 'GATE_VERSAO'],
    [[COMPLETO, '--raiz', FX, '--csv', csvRuim, '--registros', a.regs], 'CSV_CABECALHO'],
  ];
  for (const [args, codigo] of casos) {
    const r = rodar(...args);
    assert.equal(r.codigo, 2, `${codigo}: ${r.err}`);
    assert.match(r.err, new RegExp(`^FALHA ${codigo} `), r.err);
  }
  assert.deepEqual(arvore(a.T), ['ruim.csv']);
  assert.equal(readFileSync(csvRuim, 'utf8'), 'a,b\n1,2\n');
});

test('T9 resumo: semana ISO (virada do ano e fronteiras)', () => {
  assert.equal(semanaIso('2026-12-31T12:00:00Z'), '2026-W53');
  assert.equal(semanaIso('2027-01-01T00:00:00Z'), '2026-W53');
  assert.equal(semanaIso('2025-12-29T00:00:00Z'), '2026-W01');
  assert.equal(semanaIso('2026-10-18T23:59:59Z'), '2026-W42'); // domingo
  assert.equal(semanaIso('2026-10-19T00:00:00Z'), '2026-W43'); // segunda
  assert.equal(semanaIso('lixo'), null);
});

const CSV_RESUMO = path.join(FX, 'resumo.csv');
const celulas = (texto, semana) => texto.split('\n').find((l) => l.startsWith(`| ${semana} |`)).split('|').slice(1, -1).map((c) => c.trim());

test('T9 resumo: contagens, medias e somas por semana, da mais recente para a mais antiga', () => {
  const r = rodar('resumo', '--csv', CSV_RESUMO);
  assert.equal(r.codigo, 0, r.err);
  const semanas = r.out.split('\n').filter((l) => /^\| 2026-W/.test(l)).map((l) => l.split('|')[1].trim());
  assert.deepEqual(semanas, ['2026-W43', '2026-W42', '2026-W41']);
  // semana, tarefas, aprov, reprov, inconcl, sem gate, harness medio, gate total, pct, retrab, mut, interv, falhas
  assert.deepEqual(celulas(r.out, '2026-W41'), ['2026-W41', '2', '1', '1', '0', '0', '150', '60', '3', '2', '1', '1', 'a2']);
  assert.deepEqual(celulas(r.out, '2026-W42'), ['2026-W42', '3', '1', '0', '1', '1', '60', '30', '6', '1', 'n/p', 'n/p', '-']);
  assert.deepEqual(celulas(r.out, '2026-W43'), ['2026-W43', '1', '1', '0', '0', '0', '45.5', '15', 'n/p', 'n/p', 'n/p', 'n/p', '-']);
  assert.ok(r.out.endsWith('\n6 tarefas\n'));
  assert.match(r.err, /AVISO CELULA_ILEGIVEL b3 pct_limite: abc/); // "abc" fora da soma (6 = 2 + 4)
});

test('T9 resumo: --semana filtra; --saida grava o mesmo texto e nao toca o csv', () => {
  const a = ambiente();
  mkdirSync(a.T, { recursive: true });
  const saida = path.join(a.T, 'resumo.md');
  const hash = sha(CSV_RESUMO);
  const r = rodar('resumo', '--csv', CSV_RESUMO, '--semana', '2026-W41', '--saida', saida);
  assert.equal(r.codigo, 0, r.err);
  assert.ok(r.out.includes('| 2026-W41 |') && !r.out.includes('| 2026-W42 |'));
  assert.ok(r.out.endsWith('\n2 tarefas\n'));
  assert.equal(readFileSync(saida, 'utf8'), r.out);
  assert.equal(sha(CSV_RESUMO), hash);
});

test('T9 resumo: csv vazio so tem cabecalho e 0 tarefas', () => {
  const a = ambiente();
  mkdirSync(a.T, { recursive: true });
  const csv = path.join(a.T, 'vazio.csv');
  writeFileSync(csv, COLUNAS.join(',') + '\n');
  const r = rodar('resumo', '--csv', csv);
  assert.equal(r.codigo, 0, r.err);
  assert.ok(r.out.endsWith('\n0 tarefas\n'));
  assert.ok(!/^\| 20/m.test(r.out));
});

test('T9 resumo: --semana mal formada, csv ausente ou sem cabecalho: codigo 2 sem escrever', () => {
  const a = ambiente();
  mkdirSync(a.T, { recursive: true });
  const saida = path.join(a.T, 'resumo.md');
  const sem = path.join(a.T, 'sem-cabecalho.csv');
  writeFileSync(sem, 'x,y\n1,2\n');
  for (const args of [['--csv', CSV_RESUMO, '--semana', '2026-42'], ['--csv', CSV_RESUMO, '--semana', '2026-W54'], ['--csv', path.join(a.T, 'nao.csv')], ['--csv', sem], []]) {
    const r = rodar('resumo', ...args, '--saida', saida);
    assert.equal(r.codigo, 2, args.join(' '));
    assert.match(r.err, /^FALHA [A-Z_]+ /);
  }
  assert.ok(!existsSync(saida));
});

// retrato de uma pasta: caminho relativo -> hash do conteudo
const retrato = (dir) => Object.fromEntries(readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => {
  const f = path.join(e.parentPath, e.name);
  return [path.relative(dir, f).split(path.sep).join('/'), sha(f)];
}).sort());

test('T10 trace, anotar e resumo so escrevem onde mandaram', () => {
  const raiz = pasta();
  cpSync(FX, raiz, { recursive: true });
  const T = pasta();
  const csv = path.join(T, 'reg', 'registro-execucao.csv');
  const regs = path.join(T, 'registros');
  const saida = path.join(T, 'resumo.md');
  const antesRaiz = retrato(raiz);
  assert.equal(rodar(COMPLETO, '--raiz', raiz, '--csv', csv, '--registros', regs).codigo, 0);
  assert.equal(rodar('anotar', 'tarefa-completa', '--csv', csv, '--pct', '3').codigo, 0);
  assert.equal(rodar('resumo', '--csv', csv, '--saida', saida).codigo, 0);
  assert.deepEqual(retrato(raiz), antesRaiz);
  assert.deepEqual(Object.keys(retrato(T)), ['registros/tarefa-completa.md', 'reg/registro-execucao.csv', 'resumo.md'].sort());
  rmSync(raiz, { recursive: true, force: true });
  rmSync(T, { recursive: true, force: true });
});

test('A2 resumo recusa --saida igual ao --csv, sem gravar', (t) => {
  const T = pasta();
  const csv = path.join(T, 'x.csv');
  copyFileSync(CSV_RESUMO, csv);
  const antes = sha(csv);
  const formas = [csv, path.relative(process.cwd(), csv), `.${path.sep}${path.relative(process.cwd(), csv)}`];
  const link = path.join(T, 'link.csv');
  try {
    symlinkSync(csv, link);
    formas.push(link);
  } catch {
    t.diagnostic('ambiente nao criou symlink de arquivo; vale a juncao da pasta');
  }
  // juncao de pasta nao pede privilegio no Windows e tambem exige realpath
  const pastaLink = pasta();
  const juncao = path.join(pastaLink, 'j');
  symlinkSync(T, juncao, 'junction');
  formas.push(path.join(juncao, 'x.csv'));
  for (const saida of formas) {
    const r = rodar('resumo', '--csv', csv, '--saida', saida);
    assert.equal(r.codigo, 2, saida);
    assert.match(r.err, /^FALHA SAIDA_IGUAL_CSV /);
    assert.equal(sha(csv), antes, saida);
  }
  // --saida diferente grava e nao toca o csv
  const outra = path.join(T, 'resumo.md');
  const r = rodar('resumo', '--csv', csv, '--saida', outra);
  assert.equal(r.codigo, 0, r.err);
  assert.equal(readFileSync(outra, 'utf8'), r.out);
  assert.equal(sha(csv), antes);
  removerJuncao(juncao); // so o link; o alvo e T
  rmSync(pastaLink, { recursive: true, force: true });
  rmSync(T, { recursive: true, force: true });
});

test('T10 os testes nao deixam rastro: pastas temporarias isoladas do repositorio', () => {
  const a = ambiente();
  trace(a);
  assert.ok(a.csv.startsWith(os.tmpdir()));
  rmSync(a.T, { recursive: true, force: true });
});

test('G4 resumo recusa --saida hardlink do csv, sem gravar', (t) => {
  const T = pasta();
  const csv = path.join(T, 'x.csv');
  const hard = path.join(T, 'hard.csv');
  copyFileSync(CSV_RESUMO, csv);
  try {
    linkSync(csv, hard);
  } catch (e) {
    rmSync(T, { recursive: true, force: true });
    return t.skip(`ambiente nao criou hardlink: ${e.code}`);
  }
  const antes = sha(csv);
  const r = rodar('resumo', '--csv', csv, '--saida', hard);
  assert.equal(r.codigo, 2, r.err);
  assert.match(r.err, /^FALHA SAIDA_IGUAL_CSV /);
  assert.equal(sha(csv), antes);
  rmSync(T, { recursive: true, force: true });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerJson } from './json.mjs';
import { COLUNAS } from './csv.mjs';
import { esqueletoDoRegistro, linhaDoDespacho } from './registro.mjs';

const fx = path.join(path.dirname(fileURLToPath(import.meta.url)), 'trace-fixtures', '_despacho');
const carrega = (id, modelo) => ({
  contrato: { executor: { modelo }, base: { commit: 'abc1234' } },
  meta: lerJson(path.join(fx, id, 'meta.json')),
  relatorio: lerJson(path.join(fx, id, 'relatorio.json')),
});
const col = (l, nome) => l[COLUNAS.indexOf(nome)];

test('C2 linha: turnos, custo e tokens vem de meta.meta; ausente ou nulo vira vazio', () => {
  const e = { ...carrega('tarefa-completa', 'sonnet'), gate: null, rodadas: 0 };
  e.meta.meta = { turnos: 27, custo_usd: 0.4038165, tokens: { total: 1016506, saida: 9, raciocinio: 3 } };
  const l = linhaDoDespacho(e);
  assert.deepEqual([col(l, 'turnos'), col(l, 'custo_usd'), col(l, 'tokens_total')], [27, 0.4038165, 1016506]);
  e.meta.meta = { custo_usd: null };
  const v = linhaDoDespacho(e);
  assert.deepEqual([col(v, 'turnos'), col(v, 'custo_usd'), col(v, 'tokens_total')], ['', '', '']);
});

test('C3 registro: mostra turnos, custo e tokens quando existem e omite quando faltam', () => {
  const e = { ...carrega('tarefa-completa', 'sonnet'), gate: null };
  e.meta.meta = { turnos: 27, custo_usd: 0.4038165, tokens: { total: 1016506 } };
  const md = esqueletoDoRegistro(e);
  for (const s of ['| turnos | 27 |', '| custo (USD) | 0.4038165 |', '| tokens | 1016506 |']) assert.ok(md.includes(s), s);
  e.meta.meta = { turnos: null, custo_usd: null, tokens: null };
  const sem = esqueletoDoRegistro(e);
  assert.ok(!/null|undefined|\| turnos|\| custo|\| tokens/.test(sem));
});

test('T2 linha: 25 colunas, despacho + relatorio + gate, 4 do Rick vazias, modelo do contrato', () => {
  const e = { ...carrega('tarefa-completa', 'sonnet'), gate: lerJson(path.join(fx, 'tarefa-completa', 'gate.json')), rodadas: 2 };
  e.relatorio.modelo = 'do-relatorio'; // nao pode ser usado
  const l = linhaDoDespacho(e);
  assert.equal(l.length, 25);
  const esperado = {
    tarefa: 'tarefa-completa', executor: 'claude', modelo: 'sonnet',
    inicio_despacho: '2026-10-20T10:00:00.000Z', fim_harness: '2026-10-20T10:05:30.500Z',
    inicio_gate: '2026-10-20T10:10:00.000Z', fim_gate: '2026-10-20T10:10:20.000Z',
    duracao_harness_s: 330.5, comandos_s: '1.5|0.25', rodadas_verificacao: 2, resultado_gate: 'reprovado',
    exige_revisor: 'sim', avisos_gate: 'AVISO_A|AVISO_B', verificacoes_falhas: 'G04|G10', divergencias: 2,
    arquivos_mudados: 2, testes_novos: 5, resultado_relatorio: 'ok',
    pct_limite: '', mutantes_sobreviventes: '', retrabalho: '', intervencoes_rick: '',
  };
  for (const [nome, valor] of Object.entries(esperado)) assert.equal(col(l, nome), valor, nome);
});

test('T4 linha: sem gate -> sem_gate, 0 rodadas, colunas do gate vazias', () => {
  const l = linhaDoDespacho({ ...carrega('tarefa-sem-gate', 'gemini'), gate: null, rodadas: 7 });
  assert.equal(col(l, 'resultado_gate'), 'sem_gate');
  assert.equal(col(l, 'rodadas_verificacao'), 0);
  for (const n of ['inicio_gate', 'fim_gate', 'exige_revisor', 'avisos_gate', 'verificacoes_falhas', 'divergencias']) assert.equal(col(l, n), '', n);
  assert.equal(col(l, 'testes_novos'), 0);
  assert.equal(col(l, 'resultado_relatorio'), 'parcial');
});

test('T2 linha: campo ausente no gate vira celula vazia, nunca erro', () => {
  const l = linhaDoDespacho({ ...carrega('tarefa-completa', 'sonnet'), gate: { versao: 1, resultado: 'aprovado' }, rodadas: 1 });
  assert.equal(col(l, 'resultado_gate'), 'aprovado');
  for (const n of ['exige_revisor', 'avisos_gate', 'verificacoes_falhas', 'divergencias', 'inicio_gate']) assert.equal(col(l, n), '', n);
});

test('T5 esqueleto: secoes na ordem, valores do relatorio, escapes e _pendente_', () => {
  const gate = lerJson(path.join(fx, 'tarefa-completa', 'gate.json'));
  const md = esqueletoDoRegistro({ ...carrega('tarefa-completa', 'sonnet'), gate });
  const titulos = md.split('\n').filter((l) => l.startsWith('#'));
  assert.deepEqual(titulos, ['# Registro: tarefa-completa', '## Arquivos', '## Comandos', '## Critérios', '## Dúvidas', '## Ideias novas', '## Gate', '## Veredito da coordenação', '## Gasto informado']);
  for (const v of ['| tarefa | tarefa-completa |', '| modelo | sonnet |', '| base | abc1234 |', '| commit | 1a2b3c4 |', '| branch | infra/m2 |', '| resultado do relatorio | ok |', '| resultado do gate | reprovado |', '- tools/agents/a.mjs']) assert.ok(md.includes(v), v);
  // barra e quebra de linha escapadas na celula; nada de quebra no meio da tabela
  assert.ok(md.includes('| node --test a.test.mjs | 1.5 | 0 | 3 testes \\| 3 passam<br>segunda linha |'));
  assert.ok(md.includes('| T1 a \\| b |'));
  assert.ok(md.includes('- x|y.txt')); // lista nao escapa barra
  // gate: so verificacoes diferentes de ok
  assert.ok(md.includes('| G04 | falha | FORA_DA_LISTA |') && md.includes('| G09 | aviso |'));
  assert.ok(!md.includes('| G01 |'));
  assert.ok(md.endsWith('## Veredito da coordenação\n\n_pendente_\n\n## Gasto informado\n\n_pendente_\n'));
});

test('T5 esqueleto: sem gate a secao diz "sem gate"', () => {
  const md = esqueletoDoRegistro({ ...carrega('tarefa-sem-gate', 'gemini'), gate: null });
  assert.ok(md.includes('## Gate\n\nsem gate\n'));
  assert.ok(md.includes('| resultado do gate | sem_gate |'));
  assert.ok(md.includes('## Dúvidas\n\n_nenhum_'));
});

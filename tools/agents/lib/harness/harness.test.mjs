import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adaptador } from './index.mjs';
import { lerContrato } from '../contrato.mjs';

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const ler = (p) => readFileSync(aqui(p), 'utf8');
const claudeOk = ler('./fixtures/claude-ok.json');
const agyOk = ler('./fixtures/agy-ok.json');
const opencodeOk = ler('./fixtures/opencode-ok.txt');
const sembom = (t) => t.replace(/^\uFEFF/, '');
const contrato = {
  id: 'ex',
  executor: { harness: 'claude', modelo: 'sonnet' },
  limites: { turnos: 12, minutos: 20 },
  comandos_validacao: ['node --test x.mjs', 'git status --short', 'npx vitest run'],
};
const entrada = { prompt: 'faca', schemaTexto: '{"type":"object"}', schemaCaminho: 'C:/s.json' };
const claude = adaptador('claude');
const agy = adaptador('agy');
const opencode = adaptador('opencode');
const claudeVar = (f) => claude.lerSaida(JSON.stringify(f(JSON.parse(sembom(claudeOk)))));
const agyVar = (f) => agy.lerSaida(JSON.stringify(f(JSON.parse(agyOk))));

test('H1 adaptador devolve nome, montarComando e lerSaida', () => {
  for (const n of ['claude', 'agy', 'opencode']) {
    const a = adaptador(n);
    assert.equal(a.nome, n);
    assert.equal(typeof a.montarComando, 'function');
    assert.equal(typeof a.lerSaida, 'function');
  }
});

test('H1 harness desconhecido lanca', () => {
  for (const n of ['codex', '', 'toString']) {
    assert.throws(() => adaptador(n), { message: `harness desconhecido: ${n}` });
  }
});

test('H2 claude: montarComando', () => {
  const { exe, args } = claude.montarComando(contrato, entrada);
  assert.equal(exe, 'claude');
  assert.equal(args[0], '-p');
  assert.equal(args[1], 'faca');
  const i = (f) => args.indexOf(f);
  assert.equal(args[i('--output-format') + 1], 'json');
  assert.equal(args[i('--json-schema') + 1], entrada.schemaTexto);
  assert.equal(args[i('--model') + 1], 'sonnet');
  assert.ok(i('--model') < i('--max-turns'));
  assert.equal(args[i('--max-turns') + 1], '12');
  assert.ok(i('--allowedTools') > i('--max-turns'));
  const permitidas = args.slice(i('--allowedTools') + 1);
  assert.equal(args.length, i('--allowedTools') + 1 + permitidas.length);
  assert.ok(permitidas.includes('Bash(node --test x.mjs*)'));
  assert.ok(permitidas.includes('Bash(npx vitest run*)'));
  assert.ok(permitidas.includes('Bash(git status*)'));
  assert.ok(!permitidas.includes('Bash(git status --short*)'));
  assert.equal(new Set(permitidas).size, permitidas.length);
});

test('H5 claude: --settings antes de --allowedTools, que segue por ultimo; sem ele a saida e a de antes', () => {
  const sem = claude.montarComando(contrato, entrada);
  assert.deepEqual(sem.args, ['-p', 'faca', '--output-format', 'json', '--json-schema', '{"type":"object"}', '--model', 'sonnet', '--max-turns', '12', '--allowedTools', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git add*)', 'Bash(git commit*)', 'Bash(node --test x.mjs*)', 'Bash(npx vitest run*)']); // resultado de antes do h1
  for (const settingsCaminho of [undefined, '']) assert.deepEqual(claude.montarComando(contrato, { ...entrada, settingsCaminho }), sem);
  const com = claude.montarComando(contrato, { ...entrada, settingsCaminho: 'C:/d/hooks-claude.json' });
  const i = com.args.indexOf('--settings');
  assert.equal(com.args[i + 1], 'C:/d/hooks-claude.json');
  assert.ok(i < com.args.indexOf('--allowedTools'));
  const sup = sem.args.indexOf('--allowedTools');
  assert.deepEqual(com.args.slice(sup + 2), sem.args.slice(sup)); // tudo de --allowedTools em diante e igual: ele continua o ultimo
  assert.deepEqual(com.args.filter((_, j) => j !== i && j !== i + 1), sem.args);
});

test('H2 claude: entradas invalidas lancam', () => {
  assert.throws(() => claude.montarComando(contrato, { ...entrada, prompt: '' }));
  assert.throws(() => claude.montarComando(contrato, { ...entrada, schemaTexto: '' }));
  assert.throws(() => claude.montarComando({ ...contrato, limites: undefined }, entrada));
});

test('H3 agy: montarComando', () => {
  const { exe, args } = agy.montarComando(contrato, entrada);
  assert.equal(exe, 'agy');
  assert.deepEqual(args, ['-p', 'faca', '--mode', 'accept-edits', '--output-format', 'json', '--json-schema', 'C:/s.json']);
  assert.ok(!args.includes('--model'));
  assert.throws(() => agy.montarComando(contrato, { prompt: 'faca' }));
});

test('H4 opencode: montarComando', () => {
  const { exe, args } = opencode.montarComando(contrato, entrada);
  assert.equal(exe, 'opencode');
  assert.deepEqual(args, ['run', 'faca', '--model', 'sonnet']);
  assert.ok(!args.some((a) => a.includes('--auto') || a.includes('--format')));
});

test('H5 claude: lerSaida com a saida real (BOM)', () => {
  assert.equal(claudeOk.charCodeAt(0), 0xfeff);
  const r = claude.lerSaida(claudeOk);
  assert.equal(r.ok, true);
  assert.equal(r.erro, null);
  assert.ok(r.relatorio.tarefa && r.relatorio.commit);
  assert.equal(r.relatorio.resultado, 'ok');
  assert.equal(r.meta.turnos, 10);
  assert.equal(typeof r.meta.custo_usd, 'number');
  assert.equal(typeof r.meta.sessao, 'string');
});

test('H5 claude: variacoes de erro', () => {
  const erro = claudeVar((o) => ({ ...o, is_error: true, subtype: 'error_max_turns' }));
  assert.equal(erro.ok, false);
  assert.equal(erro.erro.codigo, 'CLAUDE_ERRO');
  assert.match(erro.erro.mensagem, /error_max_turns/);
  const viaResult = claudeVar(({ structured_output, ...o }) => o);
  assert.equal(viaResult.ok, true);
  assert.equal(viaResult.relatorio.resultado, 'ok');
  assert.equal(claudeVar(({ structured_output, result, ...o }) => o).erro.codigo, 'SEM_RELATORIO');
  assert.equal(claudeVar(({ structured_output, ...o }) => ({ ...o, result: 'texto livre' })).erro.codigo, 'SEM_RELATORIO');
  assert.equal(claude.lerSaida('texto qualquer').erro.codigo, 'SAIDA_INVALIDA');
  assert.equal(claude.lerSaida('').erro.codigo, 'SAIDA_INVALIDA');
  assert.equal(claude.lerSaida(claudeOk.slice(0, 50)).erro.codigo, 'SAIDA_INVALIDA');
  assert.equal(claude.lerSaida('42').erro.codigo, 'SAIDA_INVALIDA');
  assert.equal(claude.lerSaida(undefined).erro.codigo, 'SAIDA_INVALIDA');
});

test('H6 agy: lerSaida com a saida real', () => {
  const r = agy.lerSaida(agyOk);
  assert.equal(r.ok, true);
  assert.ok(r.relatorio.commit);
  assert.ok(Array.isArray(r.relatorio.arquivos_mudados));
  assert.equal(typeof r.meta.sessao, 'string');
  assert.equal(r.meta.turnos, null);
});

test('H6 agy: variacoes de erro', () => {
  const st = agyVar((o) => ({ ...o, status: 'ERROR' }));
  assert.equal(st.ok, false);
  assert.equal(st.erro.codigo, 'AGY_STATUS');
  assert.equal(st.erro.mensagem, 'ERROR');
  assert.equal(agyVar((o) => ({ ...o, response: 'nao e json' })).erro.codigo, 'SEM_RELATORIO');
  assert.equal(agyVar((o) => ({ ...o, response: 7 })).erro.codigo, 'SEM_RELATORIO');
  assert.equal(agy.lerSaida('{quebrado').erro.codigo, 'SAIDA_INVALIDA');
  assert.equal(agy.lerSaida('').erro.codigo, 'SAIDA_INVALIDA');
  assert.deepEqual(agy.lerSaida('\uFEFF' + agyOk), agy.lerSaida(agyOk));
});

test('H7 opencode: lerSaida nunca traz relatorio', () => {
  for (const t of [opencodeOk, '', undefined]) {
    const r = opencode.lerSaida(t);
    assert.equal(r.ok, false);
    assert.equal(r.relatorio, null);
    assert.equal(r.erro.codigo, 'RELATORIO_NO_ARQUIVO');
    assert.deepEqual(r.meta, { turnos: null, custo_usd: null, duracao_ms: null, sessao: null });
  }
});

test('H8 puras: nenhum modulo importa fs, processo, rede, os, path ou url', () => {
  const proibidos = /node:(fs|child_process|net|https?|os|path|url)\b|\b(?:from|require\()\s*['"](fs|child_process|net|https?|os|path|url)['"]/;
  for (const m of ['index', 'claude', 'agy', 'opencode']) {
    assert.doesNotMatch(ler(`./${m}.mjs`), proibidos, m);
  }
});

test('H8 puras: montarComando e deterministico e nao altera o contrato', () => {
  const copia = structuredClone(contrato);
  for (const n of ['claude', 'agy', 'opencode']) {
    const a = adaptador(n);
    assert.deepEqual(a.montarComando(contrato, entrada), a.montarComando(contrato, entrada));
  }
  assert.deepEqual(contrato, copia);
});

test('H9 este contrato e valido', () => {
  const c = lerContrato(aqui('./fixtures/contrato-m2-b2.md'), { schemaPath: aqui('../fixtures/contrato.schema.json') });
  assert.equal(c.id, 'm2-b2-adaptadores');
  assert.equal(c.arquivos_permitidos.length, 1);
  assert.equal(c.criterios.length, 10);
});

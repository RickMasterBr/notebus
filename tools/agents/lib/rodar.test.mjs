import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RodarErro, parseId, caminhosPadrao, lerCommitVigente, caminhoGate, resumoAntes, veredito, resumoFinal } from './rodar.mjs';

const cab = (harness = 'claude') => ({
  id: 'tarefa-x', executor: { harness, modelo: 'sonnet' }, limites: { turnos: 20, minutos: 30 },
  arquivos_permitidos: ['a', 'b'], areas_autorizadas: [],
});
const codigoDe = (f) => { try { f(); } catch (e) { return e instanceof RodarErro ? e.codigo : 'outro'; } return null; };

test('L2 parseId aceita o padrao do schema e recusa o resto', () => {
  assert.equal(parseId('m2-l1-rodar'), 'm2-l1-rodar');
  for (const ruim of ['Maiuscula', '../x', '-x', '', 'a b', undefined]) assert.equal(codigoDe(() => parseId(ruim)), 'ID_INVALIDO', String(ruim));
});

test('L1 caminhosPadrao deriva tudo da raiz', () => {
  const c = caminhosPadrao({ raiz: '/r' });
  assert.match(c.contrato('x').replace(/\\/g, '/'), /^\/r\/notebus-docs\/docs\/v1\/contratos\/x\.md$/);
  assert.match(c.schemas.replace(/\\/g, '/'), /^\/r\/notebus-docs\/docs\/v1\/infra\/modelos$/);
  assert.match(c.gateVigente.replace(/\\/g, '/'), /^\/r\/_gate-bin\/VIGENTE\.txt$/);
});

test('L3 lerCommitVigente tira espacos e quebra de linha e recusa lixo', () => {
  assert.equal(lerCommitVigente('  796e0fc \r\n'), '796e0fc');
  for (const ruim of ['xyz', '', '123456', 'g'.repeat(8), 'a'.repeat(41)]) assert.equal(codigoDe(() => lerCommitVigente(ruim)), 'GATE_VIGENTE_INVALIDO', ruim);
  assert.match(caminhoGate('/r', 'abc1234').replace(/\\/g, '/'), /_gate-bin\/abc1234\/tools\/agents\/gate\.mjs$/);
});

test('L4 resumoAntes tem as 5 linhas e a frase de gasto por harness', () => {
  const r = resumoAntes(cab(), { gateCommit: '796e0fc' }).split('\n');
  assert.equal(r.length, 6);
  assert.match(r[0], /^Tarefa:\s+tarefa-x$/);
  assert.match(r[1], /^Agente:\s+claude \(sonnet\)\s+-> gasta o limite de 5 h do Claude$/);
  assert.match(r[2], /^Limites:\s+20 turnos, 30 minutos$/);
  assert.match(r[3], /^Arquivos:\s+2 permitidos, 0 areas protegidas autorizadas$/);
  assert.match(r[4], /^Gate:\s+copia confiavel 796e0fc$/);
  assert.match(resumoAntes(cab('agy'), { gateCommit: 'x' }), /gasta o limite do Antigravity/);
  assert.match(resumoAntes(cab('opencode'), { gateCommit: 'x' }), /gratis \(limite invisivel do provedor\)/);
});

test('L8 veredito pelos codigos', () => {
  assert.equal(veredito(0, true), 'APROVADO');
  assert.equal(veredito(1, true), 'REPROVADO');
  assert.equal(veredito(1, false), 'FALHOU');
  assert.equal(veredito(3, true), 'INCONCLUSIVO');
  assert.equal(veredito(2, false), 'USO ERRADO');
});

test('L8 resumoFinal so mostra o que existe e nunca undefined, null ou NaN', () => {
  const meta = { duracao_s: 416.6, meta: { turnos: 27, custo_usd: 0.4, tokens: 1000 } };
  const cheio = resumoFinal(meta, {}, 0, { relatorio: '/d/relatorio.json', meta: '/d/meta.json' });
  for (const t of ['Veredito: APROVADO', 'Duracao: 416.6 s', 'Turnos: 27', 'Custo (USD): 0.4', 'Tokens: 1000', 'Relatorio: /d/relatorio.json', 'Meta: /d/meta.json', 'Proximo passo: avise a coordenacao que terminou']) assert.ok(cheio.includes(t), t);
  const sem = resumoFinal({ duracao_s: NaN, meta: { turnos: 3, custo_usd: null } }, null, 1, {});
  assert.ok(!sem.includes('Custo') && !sem.includes('Tokens') && !sem.includes('Duracao') && !sem.includes('Relatorio'));
  assert.ok(sem.includes('Veredito: FALHOU') && sem.includes('Turnos: 3'));
  assert.ok(resumoFinal(null, null, 2, {}).includes('Sem meta.json'));
  for (const t of [cheio, sem, resumoFinal(null, null, 2, {}), resumoFinal({}, null, 1, {})]) assert.doesNotMatch(t, /undefined|null|NaN/);
});

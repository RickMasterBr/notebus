import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compararRelatorio } from './comparar.mjs';

const base = () => ({
  relatorio: { arquivos_mudados: ['a.ts', 'b.ts'], fora_do_pedido: [], comandos: [{ comando: 'c1', duracao_s: 1, codigo_saida: 0, resumo: '' }] },
  gateArquivos: ['a.ts', 'b.ts'],
  gateForaDaLista: [],
  comandosExecutados: [{ comando: 'c1', codigo_saida: 0, status: 'concluido' }],
  comandosContrato: ['c1'],
});
const com = (mudanca) => compararRelatorio({ ...base(), ...mudanca });
const codigos = (l) => l.map((x) => x.codigo);
const VAZIO = { falhas: [], divergencias: [], avisos: [] };

test('X6 comparar: relatorio igual ao estado do gate nao tem falha, aviso nem divergencia', () => {
  assert.deepEqual(com({}), VAZIO);
});

test('X6 comparar: arquivos_mudados faltando um arquivo e RELATORIO_OUTRO_ESTADO', () => {
  const r = com({ relatorio: { ...base().relatorio, arquivos_mudados: ['a.ts'] } });
  assert.deepEqual(codigos(r.falhas), ['RELATORIO_OUTRO_ESTADO']);
  assert.deepEqual(r.divergencias, [{ campo: 'arquivos_mudados', relatorio: ['a.ts'], gate: ['a.ts', 'b.ts'], efeito: 'falha' }]);
});

test('X6 comparar: fora_do_pedido diferente do conjunto fora da lista e RELATORIO_OUTRO_ESTADO', () => {
  assert.deepEqual(codigos(com({ gateForaDaLista: ['c.ts'] }).falhas), ['RELATORIO_OUTRO_ESTADO']);
});

test('X6 comparar: conjuntos em ordem trocada sao iguais', () => {
  assert.deepEqual(com({ relatorio: { ...base().relatorio, arquivos_mudados: ['b.ts', 'a.ts'] } }).falhas, []);
});

test('X6 comparar: relatorio diz 0 onde o gate viu falha e RELATORIO_ESCONDE_FALHA', () => {
  const r = com({ comandosExecutados: [{ comando: 'c1', codigo_saida: 1, status: 'concluido' }] });
  assert.deepEqual(codigos(r.falhas), ['RELATORIO_ESCONDE_FALHA']);
  assert.equal(r.divergencias[0].efeito, 'falha');
});

test('X6 comparar: relatorio com falha onde o gate viu 0 e so aviso', () => {
  const r = com({ relatorio: { ...base().relatorio, comandos: [{ comando: 'c1', duracao_s: 1, codigo_saida: 2, resumo: '' }] } });
  assert.deepEqual([r.falhas, codigos(r.avisos)], [[], ['RELATORIO_DIZ_FALHA']]);
});

test('X6 comparar: duracao_s diferente nao gera nada', () => {
  assert.deepEqual(com({ relatorio: { ...base().relatorio, comandos: [{ comando: 'c1', duracao_s: 999, codigo_saida: 0, resumo: '' }] } }), VAZIO);
});

test('X6 comparar: comando do contrato que o relatorio nao traz e aviso COMANDO_NAO_RELATADO', () => {
  const r = com({ relatorio: { ...base().relatorio, comandos: [] } });
  assert.deepEqual([r.falhas, codigos(r.avisos)], [[], ['COMANDO_NAO_RELATADO']]);
});

test('X6 comparar: comando sem codigo no gate (tempo, ferramenta) nao e comparado', () => {
  assert.deepEqual(com({ comandosExecutados: [{ comando: 'c1', codigo_saida: null, status: 'sem_tempo' }] }), VAZIO);
});

test('X6 comparar: entrada nao e alterada', () => {
  const e = { ...base(), comandosExecutados: [{ comando: 'c1', codigo_saida: 1, status: 'concluido' }] };
  const copia = structuredClone(e);
  compararRelatorio(e);
  assert.deepEqual(e, copia);
});

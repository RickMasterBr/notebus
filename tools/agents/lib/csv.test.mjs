import test from 'node:test';
import assert from 'node:assert/strict';
import { CABECALHO, COLUNAS, escapar, ler, linha } from './csv.mjs';

test('T1 csv: cabecalho fixo com 22 colunas na ordem do contrato', () => {
  assert.equal(COLUNAS.length, 22);
  assert.equal(CABECALHO, 'tarefa,executor,modelo,inicio_despacho,fim_harness,inicio_gate,fim_gate,duracao_harness_s,comandos_s,rodadas_verificacao,resultado_gate,exige_revisor,avisos_gate,verificacoes_falhas,divergencias,arquivos_mudados,testes_novos,resultado_relatorio,pct_limite,mutantes_sobreviventes,retrabalho,intervencoes_rick\n');
});

test('T1 csv: escapa so o que precisa', () => {
  assert.equal(escapar('simples'), 'simples');
  assert.equal(escapar('a|b'), 'a|b');
  assert.equal(escapar('a,b'), '"a,b"');
  assert.equal(escapar('diz "oi"'), '"diz ""oi"""');
  assert.equal(escapar('a\nb'), '"a\nb"');
  assert.equal(escapar(undefined), '');
  assert.equal(escapar(0), '0');
});

test('T1 csv: ida e volta identica (virgula, aspas, barra, quebra, acento, vazio)', () => {
  const linhas = [
    ['a,b', 'diz "oi"', 'x|y', 'l1\nl2', 'coração ção', '', 'fim'],
    ['', '', 'só uma', 'c\r\nd', '"', ',', ''],
  ];
  const texto = CABECALHO + linhas.map(linha).join('');
  const lido = ler(texto);
  assert.deepEqual(lido.cabecalho, COLUNAS);
  assert.deepEqual(lido.linhas, linhas);
  assert.equal(CABECALHO + lido.linhas.map(linha).join(''), texto);
});

test('T1 csv: fim de linha e sempre \\n e aceita \\r\\n na leitura', () => {
  assert.ok(!linha(['a', 'b']).includes('\r'));
  assert.deepEqual(ler('a,b\r\n1,2\r\n').linhas, [['1', '2']]);
  assert.deepEqual(ler('a,b\n1,2').linhas, [['1', '2']]);
});

test('T1 csv: aspas sem fechar e erro com codigo', () => {
  assert.throws(() => ler('a,b\n"x,2\n'), { code: 'CSV_INVALIDO' });
});

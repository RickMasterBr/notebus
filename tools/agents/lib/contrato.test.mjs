import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extrairCabecalho, lerContrato, casa, ContratoErro } from './contrato.mjs';

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url);
const fxp = (n) => fx(n).pathname.replace(/^\/([a-z]:)/i, '$1');
const schemaPath = fxp('contrato.schema.json');
const tmp = mkdtempSync(path.join(tmpdir(), 'contrato-'));
let n = 0;

const erra = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof ContratoErro, String(e));
    return e.erros;
  }
  assert.fail('nao lancou');
};
const codigos = (erros) => erros.map((e) => e.codigo);
const lerFx = (nome) => lerContrato(fxp(nome), { schemaPath });
// monta um contrato a partir do valido com alteracoes no cabecalho
const lerMut = (alt) => {
  const { cabecalho } = extrairCabecalho(readFileSync(fx('contrato-valido.md'), 'utf8'));
  const h = { ...cabecalho, ...alt };
  for (const k of Object.keys(h)) if (h[k] === undefined) delete h[k];
  const f = path.join(tmp, `c${n++}.md`);
  writeFileSync(f, '```json contrato\n' + JSON.stringify(h) + '\n```\n');
  return lerContrato(f, { schemaPath });
};

test('C5 extrai cabecalho de contrato com BOM e CRLF', () => {
  const r = extrairCabecalho(readFileSync(fx('contrato-bom-crlf.md'), 'utf8'));
  assert.equal(r.cabecalho.id, 'exemplo');
  assert.equal(r.linha, 5);
});

test('C5 erros de extracao', () => {
  const ext = (nome) => erra(() => extrairCabecalho(readFileSync(fx(nome), 'utf8')));
  assert.deepEqual(codigos(ext('sem-cabecalho.md')), ['SEM_CABECALHO']);
  assert.deepEqual(codigos(ext('cabecalho-repetido.md')), ['CABECALHO_REPETIDO']);
  assert.deepEqual(codigos(ext('bloco-aberto.md')), ['BLOCO_ABERTO']);
  const j = ext('json-quebrado.md');
  assert.deepEqual(codigos(j), ['JSON_INVALIDO']);
  assert.match(j[0].mensagem, /JSON|position|Expected/);
});

test('C5 abertura com texto a mais nao e cabecalho', () => {
  assert.deepEqual(codigos(erra(() => extrairCabecalho(readFileSync(fx('abertura-com-extra.md'), 'utf8')))), ['SEM_CABECALHO']);
});

test('C6 contrato valido volta normalizado', () => {
  const c = lerFx('contrato-valido.md');
  assert.deepEqual(c.arquivos_permitidos, ['tools/agents/lib/', 'tools/agents/validar.mjs']);
  assert.deepEqual([c.arquivos_de_outro_worker, c.areas_autorizadas, c.ideias], [[], [], []]);
  assert.deepEqual(lerFx('contrato-bom-crlf.md'), c);
});

test('C6 violacoes do schema dao SCHEMA com o caminho certo', () => {
  const casos = [
    [{ id: undefined }, '/id'],
    [{ executor: { harness: 'vim', modelo: 'x' } }, '/executor/harness'],
    [{ base: { branch: 'b', commit: 'xyz' } }, '/base/commit'],
    [{ pista: 'Maiuscula' }, '/pista'],
    [{ limites: { turnos: 0, minutos: 25 } }, '/limites/turnos'],
    [{ criterios: [] }, '/criterios'],
    [{ extra: 1 }, '/extra'],
  ];
  for (const [alt, caminho] of casos) {
    const e = erra(() => lerMut(alt));
    assert.deepEqual(e.map((x) => `${x.codigo}:${x.caminho}`), [`SCHEMA:${caminho}`], JSON.stringify(alt));
  }
  const e = erra(() => lerFx('schema-violacoes.md'));
  assert.ok(e.length > 5 && e.every((x) => x.codigo === 'SCHEMA'));
  assert.match(e[0].mensagem, /^[a-zA-Z]+: /);
});

test('C7 CAMINHO_INVALIDO', () => {
  const e = erra(() => lerFx('caminho-invalido.md'));
  assert.deepEqual(e.map((x) => `${x.codigo}:${x.caminho}`), ['CAMINHO_INVALIDO:/arquivos_permitidos/0', 'CAMINHO_INVALIDO:/arquivos_permitidos/1', 'CAMINHO_INVALIDO:/arquivos_permitidos/2']);
  assert.deepEqual(codigos(erra(() => lerMut({ areas_autorizadas: ['a/../b'] }))), ['CAMINHO_INVALIDO']);
});

test('C7 CAMINHO_RESERVADO', () => {
  assert.deepEqual(codigos(erra(() => lerFx('caminho-reservado.md'))), ['CAMINHO_RESERVADO', 'CAMINHO_RESERVADO']);
  assert.deepEqual(codigos(erra(() => lerMut({ areas_autorizadas: ['.agent/'] }))), ['CAMINHO_RESERVADO']);
});

test('C7 LISTAS_SE_SOBREPOEM: igual, pasta contendo arquivo, arquivo dentro de pasta', () => {
  const e = erra(() => lerFx('sobreposicao.md'));
  assert.deepEqual(e.map((x) => `${x.codigo}:${x.caminho}`), ['LISTAS_SE_SOBREPOEM:/arquivos_permitidos/0', 'LISTAS_SE_SOBREPOEM:/arquivos_permitidos/1']);
  assert.deepEqual(codigos(erra(() => lerMut({ arquivos_permitidos: ['a/b/c.ts'], arquivos_de_outro_worker: ['a/b/'] }))), ['LISTAS_SE_SOBREPOEM']);
  // pasta vizinha de nome parecido nao se sobrepoe
  assert.equal(lerMut({ arquivos_permitidos: ['apps/mobile/'], arquivos_de_outro_worker: ['apps/mobile2/'] }).id, 'exemplo');
});

test('C7 CRITERIO_REPETIDO e dois problemas juntos', () => {
  assert.deepEqual(codigos(erra(() => lerFx('criterio-repetido.md'))), ['CRITERIO_REPETIDO']);
  const e = erra(() => lerMut({ arquivos_permitidos: ['/x'], criterios: ['a', 'a'] }));
  assert.deepEqual(codigos(e).sort(), ['CAMINHO_INVALIDO', 'CRITERIO_REPETIDO']);
});

test('C8 casa', () => {
  assert.equal(casa(['a/b.txt'], 'a/b.txt'), true);
  assert.equal(casa(['a/b.txt'], 'a/b.txt2'), false);
  assert.equal(casa(['apps/mobile/'], 'apps/mobile/src/x.ts'), true);
  assert.equal(casa(['apps/mobile'], 'apps/mobile/src/x.ts'), true);
  assert.equal(casa(['apps/mobile'], 'apps/mobile2/x'), false);
  assert.equal(casa(['apps/mobile/'], 'apps/mobile2/x'), false);
  assert.equal(casa(['Apps/Mobile/'], 'apps/mobile/X.ts'), true);
  assert.equal(casa(['apps/mobile/'], 'apps\\mobile\\src\\x.ts'), true);
  assert.equal(casa([], 'a'), false);
});

test('C10 este contrato e valido de ponta a ponta', () => {
  const c = lerFx('contrato-m2-b1.md');
  assert.equal(c.id, 'm2-b1-contrato-schema');
  assert.equal(c.arquivos_permitidos.length, 3);
  assert.equal(c.criterios.length, 11);
});

test('D3 cabecalho que nao e objeto da ContratoErro e nao TypeError', () => {
  for (const v of ['null', '5', '"x"', '[]', 'true']) {
    const f = path.join(tmp, `c${n++}.md`);
    writeFileSync(f, '```json contrato\n' + v + '\n```\n');
    const erros = erra(() => lerContrato(f, { schemaPath }));
    assert.equal(erros.length, 1);
    assert.equal(erros[0].codigo, 'SCHEMA');
    assert.equal(erros[0].caminho, '');
    assert.match(erros[0].mensagem, /^type/);
  }
});

test('D4 segmento ponto ou terminado em ponto ou espaco e invalido', () => {
  for (const p of ['./apps/', '.', 'apps/./x', 'apps./x', 'apps /x', 'a/b.', './.agent/x']) {
    assert.deepEqual(codigos(erra(() => lerMut({ arquivos_permitidos: [p] }))), ['CAMINHO_INVALIDO'], p);
  }
  for (const p of ['.github/', 'a.b/c.ts', 'apps/mobile/', 'README.md']) {
    assert.deepEqual(lerMut({ arquivos_permitidos: [p] }).arquivos_permitidos, [p], p);
  }
  for (const p of ['.agent', '.agent/x']) {
    assert.deepEqual(codigos(erra(() => lerMut({ arquivos_permitidos: [p] }))), ['CAMINHO_RESERVADO'], p);
  }
  assert.deepEqual(codigos(erra(() => lerMut({ arquivos_permitidos: ['./a', '.agent'] }))), ['CAMINHO_INVALIDO', 'CAMINHO_RESERVADO']);
});

test('D7 este contrato e valido de ponta a ponta', () => {
  const c = lerFx('contrato-m2-b1b.md');
  assert.equal(c.id, 'm2-b1b-ajustes-schema');
  assert.equal(c.arquivos_permitidos.length, 3);
  assert.equal(c.criterios.length, 8);
});

test('A1 excecoes_gate: cabecalho valido traz 4 itens; contratos antigos continuam validos', () => {
  const c = lerFx('contrato-excecoes.md');
  assert.deepEqual(c.excecoes_gate.map((x) => x.verificacao), ['G06', 'G07', 'G08', 'G14']);
  assert.ok(c.excecoes_gate[0].caminho.endsWith('/'));
  for (const antigo of ['contrato-valido.md', 'contrato-m2-b1.md', 'contrato-m2-b1b.md']) assert.equal(lerFx(antigo).excecoes_gate, undefined, antigo);
});

test('A1 excecoes_gate: cada cabecalho invalido da fixture da ContratoErro SCHEMA', () => {
  const texto = readFileSync(fx('excecoes-invalidas.md'), 'utf8');
  const blocos = texto.split(/(?=^```json contrato)/m).slice(1);
  assert.equal(blocos.length, 6);
  blocos.forEach((b, i) => {
    const f = path.join(tmp, `inv${i}.md`);
    writeFileSync(f, b);
    const e = erra(() => lerContrato(f, { schemaPath }));
    assert.ok(e.length > 0 && e.every((x) => x.codigo === 'SCHEMA' && x.caminho.startsWith('/excecoes_gate')), `caso ${i}: ${JSON.stringify(e)}`);
  });
});

test('A1 a copia do schema traz properties.excecoes_gate igual ao bloco do contrato', () => {
  const esperado = {
    type: 'array',
    description: 'Unico jeito de liberar o que o gate reprova por padrao (G06, G07, G08, G14). Escrito pela coordenacao e aprovado pelo Rick. G06: caminho pode ser pasta (termina em /); G07, G08 e G14: arquivo exato.',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['verificacao', 'caminho', 'motivo'],
      properties: {
        verificacao: { type: 'string', enum: ['G06', 'G07', 'G08', 'G14'] },
        caminho: { type: 'string', minLength: 1 },
        motivo: { type: 'string', minLength: 1 },
      },
    },
  };
  assert.deepEqual(JSON.parse(readFileSync(schemaPath, 'utf8')).properties.excecoes_gate, esperado);
});

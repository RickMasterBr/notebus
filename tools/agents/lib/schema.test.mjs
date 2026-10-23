import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validar, SchemaNaoSuportado } from './schema.mjs';

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const cods = (r) => r.erros.map((e) => `${e.codigo}:${e.caminho}`);

test('C1 type aceita e recusa cada tipo', () => {
  const casos = {
    object: [{}, [], null, 1],
    array: [[], {}, 'a'],
    string: ['a', 1],
    number: [1.5, '1', NaN, Infinity],
    integer: [2, 1.5],
    boolean: [true, 0],
    null: [null, 0],
  };
  const bons = { object: {}, array: [], string: 'a', number: 1.5, integer: 2, boolean: false, null: null };
  for (const [tipo, [bom, ...ruins]] of Object.entries(casos)) {
    assert.equal(validar({ type: tipo }, bom).ok, true, `${tipo} aceita ${JSON.stringify(bom)}`);
    for (const r of ruins) {
      const res = validar({ type: tipo }, r);
      assert.equal(res.ok, false, `${tipo} recusa ${String(r)}`);
      assert.equal(res.erros[0].codigo, 'type');
    }
    assert.equal(validar({ type: tipo }, bons[tipo]).ok, true);
  }
});

test('C1 required ausente nomeia a chave em caminho', () => {
  const r = validar({ type: 'object', required: ['a', 'b'] }, { a: 1 });
  assert.deepEqual(cods(r), ['required:/b']);
});

test('C2 additionalProperties falso, verdadeiro e schema', () => {
  assert.deepEqual(cods(validar({ type: 'object', properties: { a: {} }, additionalProperties: false }, { a: 1, x: 2 })), ['additional:/x']);
  assert.equal(validar({ type: 'object', properties: { a: {} }, additionalProperties: true }, { a: 1, x: 2 }).ok, true);
  assert.equal(validar({ type: 'object', additionalProperties: { type: 'integer' } }, { x: 2 }).ok, true);
  assert.deepEqual(cods(validar({ type: 'object', additionalProperties: { type: 'integer' } }, { x: 'a' })), ['type:/x']);
});

test('C2 properties aninhado e items com caminho', () => {
  const s = { type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'string' } } }, lista: { type: 'array', items: { type: 'integer' } } } };
  assert.deepEqual(cods(validar(s, { a: { b: 1 }, lista: [1, 'x'] })), ['type:/a/b', 'type:/lista/1']);
});

test('C2 limites exatos de itens, tamanho e numero', () => {
  assert.equal(validar({ minItems: 2 }, [1, 2]).ok, true);
  assert.deepEqual(cods(validar({ minItems: 2 }, [1])), ['minItems:']);
  assert.equal(validar({ maxItems: 2 }, [1, 2]).ok, true);
  assert.deepEqual(cods(validar({ maxItems: 2 }, [1, 2, 3])), ['maxItems:']);
  assert.equal(validar({ minLength: 2 }, 'ab').ok, true);
  assert.deepEqual(cods(validar({ minLength: 2 }, 'a')), ['minLength:']);
  assert.equal(validar({ maxLength: 2 }, 'ab').ok, true);
  assert.deepEqual(cods(validar({ maxLength: 2 }, 'abc')), ['maxLength:']);
  assert.equal(validar({ minimum: 5 }, 5).ok, true);
  assert.deepEqual(cods(validar({ minimum: 5 }, 4)), ['minimum:']);
  assert.equal(validar({ maximum: 5 }, 5).ok, true);
  assert.deepEqual(cods(validar({ maximum: 5 }, 6)), ['maximum:']);
});

test('C2 pattern, enum e const', () => {
  assert.equal(validar({ pattern: '^a+$' }, 'aaa').ok, true);
  assert.deepEqual(cods(validar({ pattern: '^a+$' }, 'b')), ['pattern:']);
  assert.equal(validar({ enum: ['x', 1, null] }, 1).ok, true);
  assert.deepEqual(cods(validar({ enum: ['x', 1] }, 'y')), ['enum:']);
  assert.equal(validar({ const: 'k' }, 'k').ok, true);
  assert.deepEqual(cods(validar({ const: 'k' }, 'j')), ['const:']);
});

test('C2 varios erros no mesmo valor saem juntos', () => {
  const r = validar({ type: 'string', minLength: 5, pattern: '^[0-9]+$', enum: ['12345'] }, 'ab');
  assert.deepEqual(cods(r), ['enum:', 'minLength:', 'pattern:']);
});

test('C3 palavras nao suportadas lancam com o nome', () => {
  for (const [palavra, schema] of [
    ['$ref', { $ref: '#/x' }],
    ['oneOf', { oneOf: [] }],
    ['format', { format: 'email' }],
    ['uniqueItems', { uniqueItems: true }],
    ['type', { type: ['string', 'null'] }],
  ]) {
    assert.throws(() => validar(schema, 'x'), (e) => e instanceof SchemaNaoSuportado && e.palavra === palavra && e.message.includes(palavra));
  }
});

test('C3 palavra desconhecida em schema aninhado lanca com caminho no schema', () => {
  assert.throws(() => validar({ properties: { a: { not: {} } } }, { a: 1 }), (e) => e.palavra === 'not' && e.caminho === '/properties/a');
});

test('C3 schema que nao e objeto lanca; pattern invalido lanca; anotacoes passam', () => {
  assert.throws(() => validar('x', 1), SchemaNaoSuportado);
  assert.throws(() => validar({ pattern: '(' }, 'a'), SyntaxError);
  const anot = { $schema: 'x', $id: 'y', title: 't', description: 'd', default: 1, examples: [1], $comment: 'c', type: 'integer' };
  assert.equal(validar(anot, 3).ok, true);
});

test('C4 relatorio-valido valida contra relatorio.schema', () => {
  assert.deepEqual(validar(fx('relatorio.schema.json'), fx('relatorio-valido.json')), { ok: true, erros: [] });
});

test('C4 mutacoes do relatorio caem com codigo e caminho', () => {
  const s = fx('relatorio.schema.json');
  const mut = (f) => {
    const r = fx('relatorio-valido.json');
    f(r);
    return cods(validar(s, r));
  };
  assert.deepEqual(mut((r) => delete r.commit), ['required:/commit']);
  assert.deepEqual(mut((r) => (r.extra = 1)), ['additional:/extra']);
  assert.deepEqual(mut((r) => (r.resultado = 'quase')), ['enum:/resultado']);
  assert.deepEqual(mut((r) => (r.comandos[0].duracao_s = -1)), ['minimum:/comandos/0/duracao_s']);
  assert.deepEqual(mut((r) => (r.comandos[0].codigo_saida = 1.5)), ['type:/comandos/0/codigo_saida']);
  assert.deepEqual(mut((r) => (r.itens[0].status = 'talvez')), ['enum:/itens/0/status']);
});

const palavra = (schema, valor, p) => {
  try {
    validar(schema, valor);
  } catch (e) {
    assert.ok(e instanceof SchemaNaoSuportado, String(e));
    assert.equal(e.palavra, p);
    return;
  }
  assert.fail(`nao lancou: ${JSON.stringify(schema)}`);
};

test('D1 required, properties e type so olham chaves proprias', () => {
  assert.deepEqual(cods(validar({ type: 'object', required: ['toString'] }, {})), ['required:/toString']);
  const s = { type: 'object', additionalProperties: false, properties: { a: {} } };
  assert.deepEqual(cods(validar(s, JSON.parse('{"constructor":1}'))), ['additional:/constructor']);
  assert.deepEqual(cods(validar(s, JSON.parse('{"__proto__":1}'))), ['additional:/__proto__']);
  palavra({ type: 'toString' }, 1, 'type');
  palavra({ type: 'constructor' }, 1, 'type');
  assert.deepEqual(cods(validar({ type: 'object', properties: { a: { type: 'string' } } }, { a: 1 })), ['type:/a']);
});

test('D2 argumento invalido de palavra suportada lanca com o nome da palavra', () => {
  const casos = [
    [{ enum: 'abc' }, 'enum'], [{ enum: [] }, 'enum'], [{ enum: [{}] }, 'enum'], [{ const: {} }, 'const'],
    [{ required: 'abc' }, 'required'], [{ required: [1] }, 'required'], [{ properties: [] }, 'properties'],
    [{ additionalProperties: 'x' }, 'additionalProperties'], [{ items: [] }, 'items'],
    [{ pattern: 5 }, 'pattern'], [{ pattern: '(' }, 'pattern'], [{ minLength: '5' }, 'minLength'],
    [{ maxLength: -1 }, 'maxLength'], [{ minItems: 1.5 }, 'minItems'], [{ maxItems: '2' }, 'maxItems'],
    [{ minimum: '1' }, 'minimum'], [{ maximum: Infinity }, 'maximum'],
  ];
  for (const [s, p] of casos) palavra(s, 5, p);
});

test('D2 argumentos validos e schemas reais passam', () => {
  assert.equal(validar({ enum: ['a', 1, true, null] }, 'a').ok, true);
  assert.equal(validar({ const: null, minLength: 0, title: 'x', description: 'y' }, null).ok, true);
  assert.equal(validar(fx('relatorio.schema.json'), fx('relatorio-valido.json')).ok, true);
});

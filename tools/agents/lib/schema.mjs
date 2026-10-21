// Validador minimo de JSON Schema. Palavra desconhecida lanca erro (falha fechada).
const ANOTACOES = ['$schema', '$id', 'title', 'description', 'default', 'examples', '$comment'];
const SUPORTADAS = [
  'type', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'maxItems',
  'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'enum', 'const',
];

export class SchemaNaoSuportado extends Error {
  constructor(palavra, caminho) {
    super(`palavra de schema nao suportada: "${palavra}" em ${caminho || '(raiz)'}`);
    this.name = 'SchemaNaoSuportado';
    this.palavra = palavra;
    this.caminho = caminho;
  }
}

const TIPOS = {
  object: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  array: Array.isArray,
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: Number.isInteger,
  boolean: (v) => typeof v === 'boolean',
  null: (v) => v === null,
};

const ehObjeto = TIPOS.object;

const conferirSchema = (schema, ondeSchema) => {
  if (!ehObjeto(schema)) throw new SchemaNaoSuportado('(schema que nao e objeto)', ondeSchema);
  for (const k of Object.keys(schema)) {
    if (!SUPORTADAS.includes(k) && !ANOTACOES.includes(k)) throw new SchemaNaoSuportado(k, ondeSchema);
  }
  if ('type' in schema && !(typeof schema.type === 'string' && schema.type in TIPOS)) {
    throw new SchemaNaoSuportado('type', ondeSchema);
  }
};

const walk = (schema, valor, caminho, ondeSchema, erros) => {
  conferirSchema(schema, ondeSchema);
  const erro = (codigo, mensagem, c = caminho) => erros.push({ caminho: c, codigo, mensagem });

  if ('type' in schema && !TIPOS[schema.type](valor)) {
    erro('type', `esperado ${schema.type}`);
    return;
  }
  if ('enum' in schema && !schema.enum.includes(valor)) erro('enum', `valor fora de ${JSON.stringify(schema.enum)}`);
  if ('const' in schema && valor !== schema.const) erro('const', `esperado ${JSON.stringify(schema.const)}`);

  if (typeof valor === 'string') {
    if ('minLength' in schema && valor.length < schema.minLength) erro('minLength', `menos de ${schema.minLength} caracteres`);
    if ('maxLength' in schema && valor.length > schema.maxLength) erro('maxLength', `mais de ${schema.maxLength} caracteres`);
    if ('pattern' in schema && !new RegExp(schema.pattern).test(valor)) erro('pattern', `nao casa com ${schema.pattern}`);
  }
  if (typeof valor === 'number') {
    if ('minimum' in schema && valor < schema.minimum) erro('minimum', `menor que ${schema.minimum}`);
    if ('maximum' in schema && valor > schema.maximum) erro('maximum', `maior que ${schema.maximum}`);
  }
  if (Array.isArray(valor)) {
    if ('minItems' in schema && valor.length < schema.minItems) erro('minItems', `menos de ${schema.minItems} itens`);
    if ('maxItems' in schema && valor.length > schema.maxItems) erro('maxItems', `mais de ${schema.maxItems} itens`);
    if ('items' in schema) valor.forEach((v, i) => walk(schema.items, v, `${caminho}/${i}`, `${ondeSchema}/items`, erros));
  }
  if (ehObjeto(valor)) {
    for (const k of schema.required ?? []) {
      if (!(k in valor)) erro('required', `chave obrigatoria ausente: ${k}`, `${caminho}/${k}`);
    }
    const props = schema.properties ?? {};
    const extra = schema.additionalProperties ?? true;
    for (const [k, v] of Object.entries(valor)) {
      if (k in props) walk(props[k], v, `${caminho}/${k}`, `${ondeSchema}/properties/${k}`, erros);
      else if (extra === false) erro('additional', `chave nao permitida: ${k}`, `${caminho}/${k}`);
      else if (extra !== true) walk(extra, v, `${caminho}/${k}`, `${ondeSchema}/additionalProperties`, erros);
    }
  }
};

export const validar = (schema, valor) => {
  const erros = [];
  walk(schema, valor, '', '', erros);
  return { ok: erros.length === 0, erros };
};

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerJson } from './lib/json.mjs';
import { validar } from './lib/schema.mjs';
import { lerContrato, ContratoErro } from './lib/contrato.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PADRAO = { contrato: 'contrato.schema.json', relatorio: 'relatorio.schema.json' };

const uso = (msg) => {
  console.error(`${msg}\nuso: node tools/agents/validar.mjs <contrato|relatorio> <arquivo> [--schema <caminho>]`);
  process.exit(2);
};

const [tipo, arquivo, ...resto] = process.argv.slice(2);
if (!Object.hasOwn(PADRAO, tipo) || !arquivo) uso('argumentos invalidos');
const i = resto.indexOf('--schema');
if (resto.length !== (i < 0 ? 0 : 2) || (i >= 0 && !resto[i + 1])) uso('argumentos invalidos');
const schemaPath = i < 0 ? path.join(RAIZ, 'docs', 'v1', 'infra', 'modelos', PADRAO[tipo]) : resto[i + 1];

for (const [rotulo, f] of [['arquivo', arquivo], ['schema', schemaPath]]) {
  if (!existsSync(f)) uso(`${rotulo} nao encontrado: ${f}`);
}

const imprime = (erros) => {
  if (!erros.length) console.log('OK');
  for (const e of erros) console.log(`${e.caminho || '/'} ${e.codigo} ${e.mensagem}`);
  process.exit(erros.length ? 1 : 0);
};

try {
  if (tipo === 'contrato') {
    lerContrato(arquivo, { schemaPath });
    imprime([]);
  }
  imprime(validar(lerJson(schemaPath), lerJson(arquivo)).erros);
} catch (e) {
  if (e instanceof ContratoErro) imprime(e.erros);
  uso(`${e.name}: ${e.message}`);
}

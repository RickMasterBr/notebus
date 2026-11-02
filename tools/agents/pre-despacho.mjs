import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RodarErro, parseId, caminhosPadrao } from './lib/rodar.mjs';
import { conferir, formatar, veredito } from './lib/predespacho.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
// toda saida e ASCII: o PowerShell do Rick mostra acento mal
const ascii = (s) => s.replace(/[^\x00-\x7F]/g, '?');

const COM_VALOR = ['--raiz', '--docs', '--repo', '--schemas'];

const lerArgs = (argv) => {
  const o = { posicionais: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manual') o.manual = true;
    else if (COM_VALOR.includes(a)) {
      if (argv[i + 1] === undefined) throw new RodarErro('USO', `${a} pede um valor`);
      o[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) throw new RodarErro('USO', `flag desconhecida: ${a}`);
    else o.posicionais.push(a);
  }
  if (o.posicionais.length !== 1) throw new RodarErro('USO', 'uso: pre-despacho <id> [--manual] [--raiz p] [--docs p] [--repo p]');
  return o;
};

const principal = (argv) => {
  const o = lerArgs(argv);
  const id = parseId(o.posicionais[0]);
  const repo = path.resolve(o.repo ?? execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: aqui, encoding: 'utf8' }).trim());
  const raiz = path.resolve(o.raiz ?? path.dirname(repo));
  const docs = o.docs ? path.resolve(o.docs) : caminhosPadrao({ raiz }).docs;
  const schemas = path.resolve(o.schemas ?? path.join(docs, 'v1', 'infra', 'modelos'));
  const contrato = path.join(docs, 'v1', 'contratos', `${id}.md`);
  if (!existsSync(contrato)) throw new RodarErro('CONTRATO_AUSENTE', `contrato nao encontrado: ${contrato}`);
  const linhas = conferir({ contrato, schemaPath: path.join(schemas, 'contrato.schema.json'), raiz, repo, manual: !!o.manual });
  for (const l of linhas) console.log(ascii(formatar(l)));
  const v = veredito(linhas);
  console.log(v.texto);
  return v.codigo;
};

try {
  process.exitCode = principal(process.argv.slice(2));
} catch (e) {
  if (e instanceof RodarErro) console.error(ascii(`FALHA ${e.codigo} ${e.message}`));
  else console.error(ascii(`FALHA ERRO_INESPERADO ${e.stack ?? e}`));
  process.exitCode = 2;
}

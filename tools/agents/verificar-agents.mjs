import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { lerJson } from './lib/json.mjs';
import { verificar } from './lib/agents-doc.mjs';

const USO = 'uso: node tools/agents/verificar-agents.mjs [--repo <pasta>] [--agents <arquivo>] [--claude <arquivo>] [--areas <arquivo>] [--docs <pasta>]';
const FLAGS = ['--repo', '--agents', '--claude', '--areas', '--docs'];

const sai = (codigo, texto) => {
  (codigo === 2 ? console.error : console.log)(texto);
  process.exit(codigo);
};

const o = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  if (!FLAGS.includes(argv[i]) || argv[i + 1] === undefined) sai(2, `argumento inválido: ${argv[i]}. ${USO}`);
  o[argv[i].slice(2)] = argv[i + 1];
}
if (!o.repo) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (r.status !== 0) sai(2, `--repo ausente e fora de um repositório git. ${USO}`);
  o.repo = r.stdout.trim();
}
const agents = o.agents ?? path.join(o.repo, 'AGENTS.md');
const claude = o.claude ?? path.join(o.repo, 'CLAUDE.md');
const areas = o.areas ?? path.join(o.repo, 'tools/agents/hooks/protected-paths.json');
const docs = o.docs ?? path.join(o.repo, 'docs');
for (const f of [agents, claude, areas]) if (!existsSync(f)) sai(2, `arquivo ausente: ${f}`);

const existe = (c) => existsSync(c.startsWith('docs/') ? path.join(docs, c.slice(5)) : path.join(o.repo, c));
const achados = verificar(readFileSync(agents, 'utf8'), readFileSync(claude, 'utf8'), { areas: lerJson(areas), existe });
for (const a of achados) console.log(`${a.regra} ${a.codigo} ${a.texto}`);
console.log(`${achados.length} achados`);
process.exit(achados.length ? 1 : 0);

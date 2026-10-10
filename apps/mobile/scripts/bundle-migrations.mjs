// Empacota os .sql gerados pelo drizzle-kit num módulo TS, para o app (Metro) e os testes (Node)
// lerem o mesmo SQL sem plugin de babel. Rodado por `npm run db:generate`.
// O SQL entra com fim de linha LF em qualquer sistema: no Windows o git pode entregar CRLF e o CI (Linux) geraria outro texto.
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../src/db/migrations/", import.meta.url);
const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", dir), "utf8"));
const entries = journal.entries.map(
  (e) => `  { tag: ${JSON.stringify(e.tag)}, sql: ${JSON.stringify(readFileSync(new URL(`${e.tag}.sql`, dir), "utf8").replace(/\r\n/g, "\n"))} },`,
);
writeFileSync(
  new URL("index.ts", dir),
  `// Gerado por scripts/bundle-migrations.mjs. Não editar à mão.\nimport type { Migration } from "../migrate";\n\nexport const migrations: readonly Migration[] = [\n${entries.join("\n")}\n];\n`,
);

/**
 * Gera `apps/mobile/src/data/licenses.generated.json` (T-90): nome, versão e licença de cada dependência de produção do app
 * (diretas e transitivas), lidas do `package-lock.json`. Sem dependência nova; saída ordenada e estável.
 * Licença: campo `license` do lock; se faltar, o `package.json` em `node_modules`; se faltar, um arquivo `LICENSE*` (marcado
 * "a conferir"); sem nada, "a conferir" também.
 *
 * Uso: `node tools/licenses/generate.mjs`
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const TO_CHECK = "a conferir";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const OUTPUT = join(ROOT, "apps/mobile/src/data/licenses.generated.json");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** Onde o npm instalou `name` visto de `from` (a pasta do pacote que o pede): sobe de `node_modules` em `node_modules`. */
function resolveDep(packages, from, name) {
  let base = from;
  for (;;) {
    const candidate = `${base ? `${base}/` : ""}node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (!base) return null;
    const cut = base.lastIndexOf("node_modules/");
    base = cut === -1 ? "" : base.slice(0, Math.max(cut - 1, 0));
  }
}

function licenseFromDisk(root, path, name) {
  const dir = join(root, path);
  if (!existsSync(dir)) return null;
  const pkgFile = join(dir, "package.json");
  if (existsSync(pkgFile)) {
    const pkg = readJson(pkgFile);
    if (typeof pkg.license === "string" && pkg.license) return pkg.license;
    if (pkg.license && typeof pkg.license.type === "string") return pkg.license.type;
  }
  return readdirSync(dir).some((f) => /^licen[cs]e/i.test(f)) ? TO_CHECK : null;
}

/** As dependências de produção a partir dos pacotes do app (`apps/mobile`), seguindo `dependencies`, `optionalDependencies` e `peerDependencies` instalados. */
export function buildLicenses(root = ROOT) {
  const lock = readJson(join(root, "package-lock.json"));
  const packages = lock.packages;
  const seen = new Set();
  const stack = ["apps/mobile"];
  while (stack.length) {
    let path = stack.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    let entry = packages[path];
    if (entry.link) {
      path = entry.resolved;
      if (seen.has(path)) continue;
      seen.add(path);
      entry = packages[path];
    }
    const wanted = { ...entry.peerDependencies, ...entry.optionalDependencies, ...entry.dependencies };
    for (const name of Object.keys(wanted)) {
      const found = resolveDep(packages, path, name);
      if (found) stack.push(found);
    }
  }
  const list = [];
  for (const path of seen) {
    const entry = packages[path];
    if (!path.includes("node_modules/") || entry.link) continue;
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    const license = entry.license || licenseFromDisk(root, path, name) || TO_CHECK;
    list.push({ name, version: entry.version, license });
  }
  list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
  return { source: "package-lock.json", packages: list };
}

export const serialize = (data) => `${JSON.stringify(data, null, 2)}\n`;

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const data = buildLicenses();
  writeFileSync(OUTPUT, serialize(data));
  console.log(`${data.packages.length} pacotes -> ${OUTPUT}`);
}

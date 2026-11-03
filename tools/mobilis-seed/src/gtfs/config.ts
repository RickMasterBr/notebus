/** `parseNetworkConfig`: valida a configuração da rede lida de JSON; cada problema diz o campo. Pura. */
import type { NetworkConfig } from "./types.ts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function parseNetworkConfig(json: unknown): { ok: true; config: NetworkConfig } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  if (!isObj(json)) return { ok: false, problems: ["a configuração não é um objeto JSON"] };

  const texts = (o: Obj, where: string, fields: string[]) => {
    for (const f of fields) if (!isText(o[f])) problems.push(`${where}.${f}: texto obrigatório`);
  };
  /** Lista de objetos; cada item passa por `each`. */
  const list = (name: string, each: (o: Obj, where: string) => void) => {
    const v = json[name];
    if (!Array.isArray(v)) return problems.push(`${name}: deve ser uma lista`);
    v.forEach((o, i) => (isObj(o) ? each(o, `${name}[${i}]`) : problems.push(`${name}[${i}]: deve ser um objeto`)));
  };

  if (!isObj(json.network)) problems.push("network: objeto obrigatório");
  else texts(json.network, "network", ["name", "timezone"]);
  texts(json, "config", ["datasetName"]);
  list("lines", (o, w) => texts(o, w, ["number", "name", "color"]));
  list("patterns", (o, w) => {
    texts(o, w, ["routeId", "code", "line", "label"]);
    if (typeof o.isCircular !== "boolean") problems.push(`${w}.isCircular: verdadeiro ou falso`);
  });
  list("stops", (o, w) => {
    texts(o, w, ["stopId", "key", "name"]);
    if (!Array.isArray(o.aliases) || !o.aliases.every((a) => typeof a === "string")) problems.push(`${w}.aliases: lista de textos`);
    if (o.externalId !== null && !isText(o.externalId)) problems.push(`${w}.externalId: texto ou nulo`);
  });
  list("holidays", (o, w) => {
    texts(o, w, ["id", "key", "date", "name"]);
    if (o.scope !== "national" && o.scope !== "municipal") problems.push(`${w}.scope: national ou municipal`);
  });

  if (Array.isArray(json.lines) && Array.isArray(json.patterns)) {
    const numbers = new Set(json.lines.map((l) => (isObj(l) ? l.number : undefined)));
    json.patterns.forEach((p, i) => {
      if (isObj(p) && isText(p.line) && !numbers.has(p.line)) problems.push(`patterns[${i}].line: linha ${p.line} não existe em lines`);
    });
  }
  return problems.length ? { ok: false, problems } : { ok: true, config: json as unknown as NetworkConfig };
}

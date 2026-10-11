/**
 * Qual apelido fez o ponto aparecer na busca (E-08 bloco 5, item 7). Puro: sem React e sem mexer no domínio.
 * Só devolve algo quando o termo casa com um apelido e NÃO casa com o nome nem com o ID: aí o resultado precisa dizer por quê.
 *
 * Exemplo: ponto "Praça Inventada" com apelido "shopping" e o termo "shop" → "shopping"; o termo "praça" → null.
 */
import { normalizeSearch } from "@notebus/domain";

interface AliasMatchable {
  name: string;
  aliases: readonly string[];
  externalId: string | null;
}

export function matchedAlias(stop: AliasMatchable, term: string): string | null {
  const needle = normalizeSearch(term);
  if (needle === "") return null;
  if (normalizeSearch(stop.name).includes(needle)) return null;
  if (stop.externalId && normalizeSearch(stop.externalId).includes(needle)) return null;
  return stop.aliases.find((alias) => normalizeSearch(alias).includes(needle)) ?? null;
}

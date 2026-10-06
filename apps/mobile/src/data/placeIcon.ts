/**
 * Regra do ícone de lugar (E-05 fechamento, item 2):
 * - Lugar novo nasce com o ícone "casa" só quando o nome é "Casa" (sem diferenciar maiúsculas, com trim).
 * - Para qualquer outro nome, o ícone padrão é o genérico (null).
 * - Durante a criação: se o usuário ainda não mexeu no ícone e muda o nome para "Casa", o ícone acompanha;
 *   se já escolheu um ícone, nada o troca.
 */

/** Devolve o ícone padrão para um dado nome: "casa" se for "Casa" (case-insensitive, trim), senão null. */
export function defaultPlaceIcon(name: string): string | null {
  return name.trim().toLowerCase() === "casa" ? "casa" : null;
}

/**
 * Resolve o ícone ao alterar o nome de um lugar novo:
 * Se o usuário já escolheu manualmente um ícone, mantém o ícone atual.
 * Se ainda não escolheu, acompanha o ícone padrão do novo nome.
 */
export function resolveNewPlaceIconOnNameChange(
  newName: string,
  currentIcon: string | null,
  userPickedIcon: boolean,
): string | null {
  if (userPickedIcon) {
    return currentIcon;
  }
  return defaultPlaceIcon(newName);
}

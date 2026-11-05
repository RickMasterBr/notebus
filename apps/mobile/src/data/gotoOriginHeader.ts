/**
 * Cabeçalho e estado inicial do seletor de origem do "Ir para" (ideia 68, contrato 07g).
 *
 * Sem trajeto ativo até o destino a origem não resolve (`kind: "no_route"`, D-175): o cabeçalho
 * pede a origem ("Escolher origem ▾") e o menu de origens já começa aberto. Escolhida a origem,
 * `activeOriginId` deixa de ser nulo e o botão "Adicionar opção" aparece como já fazia.
 * Nada aqui muda a regra de `resolveGotoOrigin`.
 */
import { t } from "../i18n";

/** "Escolher origem ▾" sem nome (indefinido ou só espaços); "de NOME ▾" com nome. */
export function originSelectorLabel(originName: string | undefined): string {
  const name = originName?.trim() ?? "";
  if (name === "") {
    return `${t("sheet_goto.origin_select_title")} ▾`;
  }
  return `${t("sheet_goto.origin_label", { origin: name })} ▾`;
}

/** O menu de origens começa aberto só quando a abertura não trouxe origem e não há trajeto. */
export function startsChoosingOrigin(
  initialOriginId: string | null | undefined,
  resolutionKind: "resolved" | "no_route",
): boolean {
  return (initialOriginId === null || initialOriginId === undefined) && resolutionKind === "no_route";
}

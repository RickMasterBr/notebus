/** Para onde cada tipo de folha vai: tela nativa ou folha sobre o Início (ADR-0008 §3, D-389). TypeScript puro. */
import type { SheetContent, SheetKind } from "../sheets/stack";

export type Destino = "folha" | "tela";

export const DESTINO: Record<SheetKind, Destino> = {
  home: "folha",
  search: "folha",
  stop: "folha",
  lineDetail: "folha",
  ahead: "folha",
  why: "folha",
  board: "folha",
  goto: "folha",
  declare: "folha",
  trip: "folha",
  alight: "folha",
  records: "tela",
  record: "tela",
  verify: "tela",
  settings: "tela",
  override: "tela",
  pastOverrides: "tela",
  holiday: "tela",
  networkInfo: "tela",
  backupImport: "tela",
  clockPicker: "tela",
  alarms: "tela",
  repeat: "tela",
  alarmIntro: "tela",
  network: "tela",
  stopEdit: "tela",
  places: "tela",
  place: "tela",
  route: "tela",
  option: "tela",
  alightPicker: "tela",
};

/** A Busca em modo escolha, aberta de dentro de uma tela, é tela (senão ficaria por baixo dela). */
export function routeOf(sheet: SheetContent, ctx: { screenFocused: boolean }): Destino {
  if (sheet.kind === "search" && sheet.pick === true && ctx.screenFocused) return "tela";
  return DESTINO[sheet.kind];
}

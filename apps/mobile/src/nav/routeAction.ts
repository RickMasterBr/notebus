/** Decide, para cada ação da pilha, se vai para as folhas (`sheetReducer`) ou para a navegação nativa. TypeScript puro. */
import type { SheetAction, SheetContent } from "../sheets/stack";
import { routeOf } from "./screenRouting";

export type RouteDecision =
  | { to: "sheets"; action: SheetAction }
  | { to: "nav"; op: "none" }
  | { to: "nav"; op: "push"; sheet: SheetContent }
  | { to: "nav"; op: "goBack" }
  | { to: "nav"; op: "replace"; sheet: SheetContent }
  | { to: "nav"; op: "popToTopThenSheets"; action: SheetAction };

/** `screenIds`: ids das telas abertas, a do topo é a última. */
export function routeAction(action: SheetAction, ctx: { screenIds: readonly number[] }): RouteDecision {
  const focused = ctx.screenIds.length > 0;
  const top = ctx.screenIds[ctx.screenIds.length - 1];
  switch (action.type) {
    case "push":
      if (routeOf(action.sheet, { screenFocused: focused }) === "tela") return { to: "nav", op: "push", sheet: action.sheet };
      return focused ? { to: "nav", op: "popToTopThenSheets", action } : { to: "sheets", action };
    case "close":
      if (ctx.screenIds.includes(action.id)) return action.id === top ? { to: "nav", op: "goBack" } : { to: "nav", op: "none" };
      return { to: "sheets", action };
    case "replace":
      return focused ? { to: "nav", op: "replace", sheet: action.sheet } : { to: "sheets", action };
    default:
      return { to: "sheets", action };
  }
}

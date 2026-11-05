import type { MessageKey } from "../i18n";

/** Chave do rótulo do VoiceOver no cartão de ônibus do "Ir para" (ideia 221). */
export function gotoCardA11yKey(leaveAtPassed: boolean): MessageKey {
  return leaveAtPassed ? "sheet_goto.a11y.bus_card_now" : "sheet_goto.a11y.bus_card";
}

/// <reference types="node" />
/**
 * Guarda estático da fiação do aviso "sem viagem" (ideia 242, contrato 07h).
 * GUARDA DE TEXTO: confere o código-fonte (uso), não o efeito no aparelho.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

const read = (rel: string) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
const squash = (text: string) => text.replace(/\s+/g, " ");

const alarmsSheet = squash(read("sheets/AlarmsSheet.tsx"));
const ptBR = read("i18n/pt-BR.ts");

// Contados no arquivo da base 88e76ce (o git diff desta tarefa não toca nessas
// linhas): 3 `<Pressable` (teste, apagar e linha do aviso) e 3 `pressedStyle(`
// (os mesmos três botões). O aviso novo é só Text e não pode mudar a conta.
const BASE_PRESSABLE_TAGS = 3;
const BASE_PRESSED_STYLE_CALLS = 3;

describe("alarmNoTripWiring: aviso de ônibus que deixou de existir (ideia 242)", () => {
  it("AlarmsSheet importa noTripNotices de ../data/alarmNoTripNotice", () => {
    expect(alarmsSheet).toContain(
      'import { noTripNotices } from "../data/alarmNoTripNotice";',
    );
  });

  it("AlarmsSheet chama noTripNotices( com os avisos ligados, os eventos e a data de hoje", () => {
    expect(alarmsSheet).toContain("noTripNotices(");
    expect(alarmsSheet).toContain(
      "setNotices(noTripNotices(allAlarms.filter((a) => a.enabled), events, lisbonWallClock(realNow()).date))",
    );
  });

  it("AlarmListItem ganha a prop notice e a lista passa notices.get(", () => {
    expect(alarmsSheet).toContain("notice?: string;");
    expect(alarmsSheet).toContain("notice={notices.get(item.id)}");
  });

  it("o aviso entra no accessibilityLabel da linha", () => {
    expect(alarmsSheet).toContain(
      "accessibilityLabel={notice ? `${lineText}. ${notice}` : lineText}",
    );
  });

  it("pt-BR.ts tem a chave alarms.no_trip com o texto combinado", () => {
    expect(ptBR).toContain(
      '"alarms.no_trip": "O ônibus das {{time}} não existe mais desde {{date}}",',
    );
  });

  it("AlarmsSheet não ganhou Pressable nem pressedStyle novos", () => {
    expect(alarmsSheet.match(/<Pressable\b/g)?.length ?? 0).toBe(BASE_PRESSABLE_TAGS);
    expect(alarmsSheet.match(/pressedStyle\(/g)?.length ?? 0).toBe(BASE_PRESSED_STYLE_CALLS);
  });
});

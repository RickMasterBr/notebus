/// <reference types="node" />
/**
 * Guardas de ligação do E-08 bloco 8: lacunas do bloco 7 e fiação do diagnóstico.
 * Confere o USO no texto-fonte (toque, aparência e VoiceOver só o aparelho decide).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => text.replace(/\s+/g, " ");

const networkSheet = squash(read("sheets/NetworkSheet.tsx"));
const stopEditSheet = squash(read("sheets/StopEditSheet.tsx"));
const diagScroll = squash(read("sheets/diagScroll.tsx"));
const sheetsContext = squash(read("sheets/SheetsContext.tsx"));

describe("item 0: lacunas do bloco 7", () => {
  it("0.1: a ação de acessibilidade delete do VoiceOver está protegida no Pressable da linha de ponto", () => {
    expect(networkSheet).toContain(
      'accessibilityActions={[{ name: "delete", label: t("stop_delete.action") }]}',
    );
  });

  it("0.2: onAccessibilityAction usa isDeleteAction e chama onDelete", () => {
    expect(networkSheet).toContain(
      "onAccessibilityAction={(event) => { if (isDeleteAction(event.nativeEvent.actionName)) onDelete(stop); }}",
    );
  });

  it("0.3: título de StopEditSheet alterna entre stop_new.title e stop_edit.title conforme isNew", () => {
    expect(stopEditSheet).toContain(
      '<Text accessibilityRole="header" style={[type.title, { color: colors.text }]}> {isNew ? t("stop_new.title") : t("stop_edit.title")} </Text>',
    );
  });

  it("0.4: seção Localização é omitida quando isNew é verdadeiro", () => {
    expect(stopEditSheet).toContain(
      '{isNew ? null : ( <View style={styles.section}> <Text style={[type.caption, { color: colors.textSecondary, fontWeight: "600" }]}> {t("stop_edit.location")} </Text>',
    );
  });
});

describe("item 1.5: guardas do diagnóstico", () => {
  it("diagScroll.tsx exporta DIAG_SCROLL = true", () => {
    expect(diagScroll).toContain("export const DIAG_SCROLL = true;");
  });

  it("SheetsContext.tsx registra fechamento ignorado e troca antes de rawDispatch", () => {
    // Trecho ancorado no dispatch: registro de fechamento ignorado e de troca antes de rawDispatch
    const dispatchBodyMatch = sheetsContext.match(
      /const dispatch = useCallback<Dispatch<SheetAction>>\(\(action\) => \{(.*?)\s*rawDispatch\(action\);/s,
    );
    expect(dispatchBodyMatch).not.toBeNull();
    const dispatchBody = dispatchBodyMatch![1]!;

    expect(dispatchBody).toContain(
      'if (DIAG_SCROLL && action.type === "close")',
    );
    expect(dispatchBody).toContain(
      "action.id !== top.id",
    );
    expect(dispatchBody).toContain(
      "fechar ignorado",
    );
    expect(dispatchBody).toContain(
      'if (DIAG_SCROLL && action.type === "replace")',
    );
    expect(dispatchBody).toContain(
      "trocar",
    );
  });
});



/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 4 (Itens 1 e 2):
 * Confere o USO no texto-fonte de LineEditSheet.tsx, toastController.ts e ToastHost.tsx.
 * (Rolagem, teclado, toque, aviso e VoiceOver só o iPhone decide).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ptBR } from "../i18n/pt-BR";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => text.replace(/\s+/g, " ");

const lineEditSheet = squash(read("sheets/LineEditSheet.tsx"));
const toastController = read("data/toastController.ts");
const toastHost = squash(read("ui/ToastHost.tsx"));

describe("E-08.5 bloco 4 guardas de ligação", () => {
  describe("Item 1: recusa de formulário some sozinha", () => {
    it("LineEditSheet.tsx: outcome.kind === 'refused' usa kind: 'refusal' e haptic: 'error'", () => {
      expect(lineEditSheet).toContain(
        '} else if (outcome.kind === "refused") { toast.show({ title: t(outcome.text.key, outcome.text.params), kind: "refusal", haptic: "error", }); }',
      );
    });

    it("LineEditSheet.tsx: line_create.error.stale continua kind: 'error'", () => {
      expect(lineEditSheet).toContain(
        'title: t("line_create.error.stale"), kind: "error", haptic: "error",',
      );
    });

    it("toastController.ts: as duas linhas preservadas", () => {
      expect(toastController).toContain("}, toastDuration(spec));");
      expect(toastController).toContain(
        "if (spec.action) return spec.screenReader ? TOAST_MS_ACTION_SCREEN_READER : TOAST_MS_ACTION;",
      );
    });

    it("toastController.ts: primeira linha nova de toastDuration trata refusal", () => {
      expect(toastController).toContain(
        'if (spec.kind === "refusal") return spec.screenReader ? TOAST_MS_REFUSAL_SCREEN_READER : TOAST_MS_REFUSAL;',
      );
    });
  });

  describe("Item 2: botão Fechar no aviso que não some sozinho", () => {
    it("ToastHost.tsx: {toastShowsClose(toast) ? ( no JSX com Pressable dismiss, accessibilityLabel e CrossGlyph", () => {
      expect(toastHost).toContain("{toastShowsClose(toast) ? (");

      const closeBranchStart = toastHost.indexOf("{toastShowsClose(toast) ? (");
      const closeBranchEnd = toastHost.indexOf(") : null}", closeBranchStart);
      const closeBranch = toastHost.substring(closeBranchStart, closeBranchEnd);

      expect(closeBranch).toContain('accessibilityLabel={t("toast.dismiss.a11y")}');
      expect(closeBranch).toContain("onPress={dismiss}");
      expect(closeBranch).toContain("<CrossGlyph color={colors.toastText} />");
      expect(closeBranch).toContain(
        '<Pressable accessibilityRole="button" accessibilityLabel={t("toast.dismiss.a11y")} onPress={dismiss}',
      );
      expect(closeBranch).toContain(
        "style={({ pressed }) => [styles.closeAction, pressed && { opacity: 0.6 }]}",
      );
    });

    it("ToastHost.tsx: estilo closeAction confere minHeight: 44 e minWidth: 44 separadamente", () => {
      const match = toastHost.match(/closeAction:\s*\{([^}]*)\}/);
      expect(match).not.toBeNull();
      const closeActionStyle = match![1];
      expect(closeActionStyle).toContain("minHeight: 44");
      expect(closeActionStyle).toContain("minWidth: 44");
    });

    it("i18n/pt-BR.ts: catálogo confere toast.dismiss.a11y como 'Fechar aviso'", () => {
      expect(ptBR["toast.dismiss.a11y"]).toBe("Fechar aviso");
    });
  });
});

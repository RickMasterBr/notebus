/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 4 (Itens 1 e 2):
 * Confere o USO no texto-fonte de LineEditSheet.tsx, toastController.ts e ToastHost.tsx.
 * (Rolagem, teclado, toque, aviso e VoiceOver só o iPhone decide).
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

const lineEditSheet = squash(read("sheets/LineEditSheet.tsx"));
const toastController = read("data/toastController.ts");

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
});

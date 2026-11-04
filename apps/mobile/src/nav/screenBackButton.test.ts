/// <reference types="node" />
/** Ligação do botão de voltar nas telas: confere o USO no texto-fonte (o toque só o aparelho decide). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");
const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");

const handle = read("sheets/SheetHandle.tsx");
const back = read("nav/ScreenBackButton.tsx");
const ptbr = read("i18n/pt-BR.ts");

const closeBranch = handle.slice(
  handle.indexOf('if (props.kind === "close") {'),
  handle.indexOf("const adjustable = ("),
);

describe("ScreenBackButton (D-397, ideia 11)", () => {
  it("C1 · dentro de tela o SheetHandle desenha o ScreenBackButton com o rótulo Voltar no lugar do CloseButton, sem barrinha nem ✕", () => {
    expect(handle).toContain('import { useScreenEntry } from "../nav/ScreenContext";');
    expect(handle).toContain('import { ScreenBackButton } from "../nav/ScreenBackButton";');
    const chooser = handle.slice(handle.indexOf("function CloseOrBack("));
    const backPos = chooser.indexOf("<ScreenBackButton onPress={onPress} />");
    const closePos = chooser.indexOf("<CloseButton onPress={onPress} />");
    expect(backPos).toBeGreaterThan(-1);
    expect(closePos).toBeGreaterThan(backPos);
    expect(chooser).toContain("return screen ? <ScreenBackButton");
    // A barrinha do ramo `close` é condicionada a não haver tela.
    expect(closeBranch).toContain("{!screen && (");
    expect(closeBranch.indexOf("{bar}")).toBeGreaterThan(closeBranch.indexOf("{!screen && ("));
    // O ✕ do ramo `close` passou pelo CloseOrBack, que escolhe pelo contexto.
    expect(closeBranch).toContain("{!props.hideCloseButton && <CloseOrBack onPress={props.onPress} />}");
    expect(closeBranch).not.toContain("<CloseButton");
  });

  it("C2 · fora de tela o SheetHandle continua igual: barrinha, CloseButton e a mesma contagem de botões com pressedStyle", () => {
    expect(handle).toContain("function CloseButton({ onPress }: { onPress: () => void })");
    expect(handle).toContain('accessibilityLabel={t("common.close")}');
    expect(handle.match(/\(\{ pressed \}\) => \[[^]*?pressedStyle\(pressed[,)]/g)?.length).toBe(1);
    expect(handle).toContain('import { pressedStyle } from "../ui/pressed";');
    // O ramo ajustável com onClose continua com o botão escolhido pelo contexto.
    expect(handle).toContain("<CloseOrBack onPress={props.onClose} />");
    expect(handle).toContain("closeRow: { minHeight: minTouch");
  });

  it("C3 · o ScreenBackButton chama o onPress recebido, tem accessibilityRole button, rótulo de t(common.back), alvo minTouch e pressedStyle", () => {
    expect(back).toContain('accessibilityRole="button"');
    expect(back).toContain('accessibilityLabel={t("common.back")}');
    expect(back).toContain("onPress={onPress}");
    expect(back).toContain("hitSlop={space.xs}");
    expect(back).toContain("height: minTouch");
    expect(back).toContain("minWidth: minTouch");
    expect(back).toContain("pressedStyle(pressed)");
  });

  it("C4 · a chave common.back existe no pt-BR.ts com o texto Voltar e nenhum texto novo está escrito no componente", () => {
    expect(ptbr).toContain('"common.back": "Voltar"');
    expect(back).toContain('t("common.back")');
    expect(back).not.toContain("Voltar");
  });

  it("C5 · hideCloseButton verdadeiro dentro de tela não desenha nem o botão nem o ✕", () => {
    expect(closeBranch).toContain("{!props.hideCloseButton && <CloseOrBack onPress={props.onPress} />}");
    expect(closeBranch.indexOf("{bar}")).toBeLessThan(
      closeBranch.indexOf("{!props.hideCloseButton && <CloseOrBack onPress={props.onPress} />}"),
    );
    // Só a barrinha condicionada a fora de tela e o botão condicionado a hideCloseButton falso.
    expect(closeBranch.match(/<Pressable\b/g)?.length).toBe(1);
    expect(closeBranch.indexOf("<Pressable")).toBeGreaterThan(closeBranch.indexOf("{!screen && ("));
  });
});

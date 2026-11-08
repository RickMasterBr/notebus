/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { frameLayoutState, frameReady, heightChanged } from "./frameLayout";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");
const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");

const frame = read("nav/ScreenSheetFrame.tsx");

describe("frameReady (C1)", () => {
  it("devolve falso para 0, negativo, NaN e Infinity", () => {
    expect(frameReady(0)).toBe(false);
    expect(frameReady(-1)).toBe(false);
    expect(frameReady(NaN)).toBe(false);
    expect(frameReady(Infinity)).toBe(false);
    expect(frameReady(-Infinity)).toBe(false);
  });

  it("devolve verdadeiro para qualquer altura finita maior que 0, com limiares 0.5 e 1", () => {
    expect(frameReady(0.5)).toBe(true);
    expect(frameReady(1)).toBe(true);
    expect(frameReady(800)).toBe(true);
  });
});

describe("frameLayoutState (C2)", () => {
  it("devolve height igual a frameHeight menos topInset e offset com top igual a topInset", () => {
    expect(frameLayoutState(800, 59)).toEqual({
      height: 741,
      offset: { top: 59, left: 0, right: 0, bottom: 0 },
    });
    expect(frameLayoutState(60, 59)).toEqual({
      height: 1,
      offset: { top: 59, left: 0, right: 0, bottom: 0 },
    });
  });

  it("devolve null quando frameHeight menos topInset não é finito ou é menor ou igual a 0", () => {
    expect(frameLayoutState(59, 59)).toBeNull();
    expect(frameLayoutState(58, 59)).toBeNull();
    expect(frameLayoutState(NaN, 0)).toBeNull();
    expect(frameLayoutState(Infinity, 59)).toBeNull();
  });
});

describe("heightChanged (C3)", () => {
  it("é falso quando a diferença é menor que 1", () => {
    expect(heightChanged(800, 800)).toBe(false);
    expect(heightChanged(800, 800.4)).toBe(false);
  });

  it("é verdadeiro só quando a diferença absoluta é de 1 ou mais", () => {
    expect(heightChanged(800, 801)).toBe(true);
    expect(heightChanged(800, 799)).toBe(true);
  });
});

describe("ScreenSheetFrame (C4)", () => {
  it("mede a própria altura com onLayout num View e só monta o BottomSheet quando frameLayoutState devolve um valor", () => {
    expect(frame).toContain("onLayout=");
    expect(frame).toContain("frameLayoutState(");
    expect(frame).toContain("useState(0)");
    expect(frame).toContain("frameLayoutState(frameHeight, insets.top) !== null");
    const frameLayoutCall = frame.indexOf("frameLayoutState(");
    const bottomSheetTag = frame.indexOf("<BottomSheet");
    expect(frameLayoutCall).toBeGreaterThan(-1);
    expect(bottomSheetTag).toBeGreaterThan(frameLayoutCall);
  });
});

describe("ScreenSheetFrame containerLayoutState (C5)", () => {
  it("o BottomSheet recebe containerLayoutState com a altura medida e não recebe containerHeight", () => {
    expect(frame).toContain("containerLayoutState={");
    expect(frame).not.toContain("containerHeight");
  });
});

describe("ScreenSheetFrame preservação (C6)", () => {
  it("mantém snapPoints={FULL}, animateOnMount={false}, topInset={insets.top}, paddingBottom: insets.bottom e enablePanDownToClose={false}", () => {
    expect(frame).toContain("snapPoints={FULL}");
    expect(frame).toContain("animateOnMount={false}");
    expect(frame).toContain("topInset={insets.top}");
    expect(frame).toContain("paddingBottom: insets.bottom");
    expect(frame).toContain("enablePanDownToClose={false}");
  });
});

describe("ScreenSheetFrame posição positiva e diagnóstico (v1-e2-01f)", () => {
  it("contém const FULL = [\"99.99%\"] e não contém 100%", () => {
    expect(frame).toContain('const FULL = ["99.99%"];');
    expect(frame).not.toContain("100%");
  });

  it("contém DIAG_SCROLL e recordDiagEvent", () => {
    expect(frame).toContain("DIAG_SCROLL");
    expect(frame).toContain("recordDiagEvent");
  });

  it("contém cada um dos textos de log de diagnóstico", () => {
    expect(frame).toContain("moldura layout h=");
    expect(frame).toContain("moldura montou cl=");
    expect(frame).toContain("moldura 150ms pos=");
    expect(frame).toContain("moldura 600ms pos=");
  });

  it("contém animatedPosition={DIAG_SCROLL e if (!DIAG_SCROLL) return", () => {
    expect(frame).toContain("animatedPosition={DIAG_SCROLL");
    expect(frame).toContain("if (!DIAG_SCROLL) return");
  });
});

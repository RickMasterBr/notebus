/// <reference types="node" />
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

const frame = read("nav/ScreenSheetFrame.tsx");

describe("ScreenSheetFrame medição na janela (C5)", () => {
  it("tem ref na View interna e mede measureInWindow aos 0, 150 e 600 ms com ZERO sob DIAG_SCROLL", () => {
    expect(frame).toContain("useRef");
    expect(frame).toContain("contentRef");
    expect(frame).toContain("ref={contentRef}");
    expect(frame).toContain("measureInWindow");
    expect(frame).toContain('"med0"');
    expect(frame).toContain('"med150"');
    expect(frame).toContain('"med600"');
    expect(frame).toContain("ZERO");
  });

  it("sem DIAG_SCROLL a medição não roda e limpa temporizadores ao perder o foco", () => {
    expect(frame).toContain("if (!DIAG_SCROLL) return;");
    expect(frame).toContain("clearTimeout(t150)");
    expect(frame).toContain("clearTimeout(t600)");
  });
});

describe("ScreenSheetFrame referência da folha e alternador (C2)", () => {
  it("guarda sheetRef e alternador flip, passando ref ao BottomSheet", () => {
    expect(frame).toContain("seenFocus");
    expect(frame).toContain("sheetRef");
    expect(frame).toContain("ref={sheetRef}");
    expect(frame).toContain("if (seenFocus.current)");
  });
});

describe("ScreenSheetFrame reassunção da posição ao voltar foco (C3)", () => {
  it("chama snapToPosition com alternância de 99.98% e 99.99% com duration: 0 na hora e aos 450 ms", () => {
    expect(frame).toContain("snapToPosition(");
    expect(frame).toContain('"99.98%"');
    expect(frame).toContain('"99.99%"');
    expect(frame).toContain("duration: 0");
    expect(frame).toContain("450");
  });
});

describe("ScreenSheetFrame ausência de key e registro da reafirmação (C1, C4)", () => {
  it("nada recebe prop key, estado de repintura saiu e registra moldura reafirma p=", () => {
    expect(frame).toContain("moldura reafirma p=");
    expect(frame).not.toContain("moldura repinta");
    expect(frame).not.toContain("key={");
    expect(frame).not.toContain("repaintKey");
    expect(frame).not.toContain("setRepaintKey");
    expect(frame).not.toContain("<BottomSheet key=");
    expect(frame).not.toContain("<MeasuredFrame key=");
    expect(frame).not.toContain("<ScreenSheetFrame key=");
  });
});

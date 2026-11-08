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

describe("ScreenSheetFrame medição na janela (C1, C2)", () => {
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

describe("ScreenSheetFrame contador repaintKey (C3)", () => {
  it("guarda repaintKey e seenFocus, subindo repaintKey a cada foco após o primeiro", () => {
    expect(frame).toContain("seenFocus");
    expect(frame).toContain("repaintKey");
    expect(frame).toContain("setRepaintKey");
    expect(frame).toContain("if (seenFocus.current)");
  });
});

describe("ScreenSheetFrame recriação do conteúdo e isolamento da folha (C4)", () => {
  it("a View interna recebe key={repaintKey} e nada mais recebe key", () => {
    expect(frame).toContain("key={repaintKey}");
    expect(frame).not.toContain("<BottomSheet key=");
    expect(frame).not.toContain("<MeasuredFrame key=");
    expect(frame).not.toContain("<ScreenSheetFrame key=");
  });
});

describe("ScreenSheetFrame registro da repintura (C5)", () => {
  it("com DIAG_SCROLL registra moldura repinta k= a cada subida do contador", () => {
    expect(frame).toContain("moldura repinta k=");
  });
});

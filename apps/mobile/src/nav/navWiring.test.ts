/// <reference types="node" />
/** Ligação da navegação nativa: confere o USO no texto-fonte (gesto e animação só o aparelho decide). */
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

const home = read("screens/Home.tsx");
const ctx = read("sheets/SheetsContext.tsx");
const stacked = read("sheets/StackedSheet.tsx");
const frame = read("nav/ScreenSheetFrame.tsx");

describe("Home.tsx", () => {
  it("NavigationContainer com o navigationRef dentro do SheetsProvider, com as duas rotas", () => {
    const provider = home.indexOf("<SheetsProvider>");
    const container = home.indexOf("<NavigationContainer ref={navigationRef}>");
    expect(provider).toBeGreaterThan(-1);
    expect(container).toBeGreaterThan(provider);
    expect(home).toContain('<Stack.Screen name="inicio"');
    expect(home).toContain('<Stack.Screen name="tela"');
    expect(home).toContain("headerShown: false");
  });
  it("o ToastHost fica depois do NavigationContainer", () => {
    expect(home.indexOf("<ToastHost />")).toBeGreaterThan(home.indexOf("</NavigationContainer>"));
  });
});

describe("SheetsContext.tsx", () => {
  it("routeAction( é chamada antes do primeiro rawDispatch(action); do dispatch", () => {
    const call = ctx.indexOf("routeAction(action");
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(ctx.indexOf("rawDispatch(action);"));
  });
  it("o value expõe state e sheetState", () => {
    expect(ctx).toContain("state: fullState, sheetState: state");
  });
});

describe("StackedSheet.tsx", () => {
  it("useScreenEntry() é a primeira instrução de StackedSheet", () => {
    const body = stacked.slice(stacked.indexOf("export function StackedSheet("));
    const first = body.indexOf("{ const screen = useScreenEntry();");
    expect(first).toBeGreaterThan(-1);
    expect(body.slice(body.indexOf("}) {") + 4).startsWith(" const screen = useScreenEntry();")).toBe(true);
  });
});

describe("ScreenSheetFrame.tsx", () => {
  it.each(["enablePanDownToClose", "enableHandlePanningGesture", "enableContentPanningGesture"])("%s é falso", (attr) => {
    expect(frame).toContain(`${attr}={false}`);
  });
  it("os três atributos de acessibilidade", () => {
    expect(frame).toContain("accessible={false}");
    expect(frame).toContain("accessibilityRole={null}");
    expect(frame).toContain("accessibilityLabel={null}");
  });
});

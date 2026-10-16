/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const normalize = (source: string) => source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").replace(/\s+/g, " ");

const read = (...parts: string[]) => normalize(readFileSync(join(__dirname, ...parts), "utf8"));
const boundary = read("DiagErrorBoundary.tsx");
const index = read("..", "..", "index.ts");

describe("ligação da captura de erro (só com DIAG_SCROLL)", () => {
  it("o manipulador global só é instalado sob DIAG_SCROLL", () => {
    expect(/export function installDiagGlobalHandler\(\) \{ if \(!DIAG_SCROLL\) return;/.test(boundary)).toBe(true);
    expect(/setGlobalHandler\(\(error, isFatal\) => \{ if \(!DIAG_SCROLL\) return originalHandler\?\.\(error, isFatal\);/.test(boundary)).toBe(true);
  });

  it("guarda o original e não o repassa com diag", () => {
    expect(/originalHandler = errorUtils\.getGlobalHandler\(\);/.test(boundary)).toBe(true);
    expect(/recordDiagError\(formatDiagError\(error\)\); \}\);/.test(boundary)).toBe(true);
  });

  it("o boundary só envolve a raiz sob DIAG_SCROLL", () => {
    expect(/export function withDiagErrorBoundary<P extends object>\(Root: ComponentType<P>\): ComponentType<P> \{ if \(!DIAG_SCROLL\) return Root;/.test(boundary)).toBe(true);
    expect(/<DiagErrorBoundary> <Root \{\.\.\.props\} \/> <\/DiagErrorBoundary>/.test(boundary)).toBe(true);
  });

  it("a tela de erro usa a formatação (mensagem, pilha e componentes)", () => {
    expect(/\["ERRO", info\.message, "", \.\.\.info\.stackLines, "", \.\.\.info\.componentLines\]/.test(boundary)).toBe(true);
    expect(/formatDiagError\(error, errorInfo\.componentStack\)/.test(boundary)).toBe(true);
  });

  it("index.ts instala o manipulador e registra a raiz envolvida pelo boundary", () => {
    expect(/\binstallDiagGlobalHandler\(\);/.test(index)).toBe(true);
    expect(/registerRootComponent\(withDiagErrorBoundary\(App\)\);/.test(index)).toBe(true);
  });
});

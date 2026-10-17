/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { isDiagEnabled } from "./diagLog";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");
const repoRoot = process.env.NB_REPO_ROOT ?? join(root, "..", "..", "..");

function parse(rel: string) {
  const code = readFileSync(join(root, rel), "utf8");
  return ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function walk(node: ts.Node, visit: (n: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (c) => walk(c, visit));
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...listSourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      out.push(relative(root, full).replace(/\\/g, "/"));
    }
  }
  return out.sort();
}

describe("E-09 Bloco 36d · guarda de build limpa sem diag (e09Bloco36Wiring)", () => {
  describe("(a) contrato de isDiagEnabled", () => {
    it("isDiagEnabled(undefined), isDiagEnabled(\"\") e isDiagEnabled(\"0\") devolvem false; só \"1\" devolve true", () => {
      expect(isDiagEnabled(undefined)).toBe(false);
      expect(isDiagEnabled("")).toBe(false);
      expect(isDiagEnabled("0")).toBe(false);
      expect(isDiagEnabled("false")).toBe(false);
      expect(isDiagEnabled("true")).toBe(false);
      expect(isDiagEnabled("1")).toBe(true);
    });
  });

  describe("(b) workflow .github/workflows/ios.yml", () => {
    const iosYml = readFileSync(join(repoRoot, ".github", "workflows", "ios.yml"), "utf8");
    const nonCommentLines = iosYml
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));

    it("o input diag tem default false ou ausente", () => {
      const diagBlockMatch = iosYml.match(/^\s{6}diag:\r?\n((?:\s{8,}.*\r?\n)+)/m);
      expect(diagBlockMatch).not.toBeNull();
      const diagProps = diagBlockMatch![1]!;
      const defaultMatch = diagProps.match(/^\s+default:\s*(.+?)\s*$/m);
      const defaultValue = defaultMatch ? defaultMatch[1]!.trim() : undefined;
      expect(defaultValue === undefined || defaultValue === "false").toBe(true);
    });

    it("EXPO_PUBLIC_NOTEBUS_DIAG só recebe valor a partir de inputs.diag e nenhum outro passo escreve essa variável", () => {
      const refs = nonCommentLines.filter((l) => l.includes("EXPO_PUBLIC_NOTEBUS_DIAG"));
      expect(refs).toEqual(["EXPO_PUBLIC_NOTEBUS_DIAG: ${{ inputs.diag && '1' || '' }}"]);
    });
  });

  describe("(c) leitura de process.env.EXPO_PUBLIC_NOTEBUS_DIAG em apps/mobile/src fora de testes", () => {
    it("é lido só em sheets/diagScroll.tsx e passado a isDiagEnabled", () => {
      const files = listSourceFiles(root);
      const readers: string[] = [];

      for (const rel of files) {
        const sf = parse(rel);
        let readsDiag = false;
        walk(sf, (n) => {
          if (ts.isIdentifier(n) && n.text === "EXPO_PUBLIC_NOTEBUS_DIAG") {
            readsDiag = true;
          } else if (ts.isStringLiteral(n) && n.text === "EXPO_PUBLIC_NOTEBUS_DIAG") {
            readsDiag = true;
          }
        });
        if (readsDiag) readers.push(rel);
      }

      expect(readers).toEqual(["sheets/diagScroll.tsx"]);

      const diagSf = parse("sheets/diagScroll.tsx");
      const decls: string[] = [];
      walk(diagSf, (n) => {
        if (ts.isVariableDeclaration(n) && n.name.getText(diagSf) === "DIAG_SCROLL") {
          decls.push(n.getText(diagSf).replace(/\s+/g, ""));
        }
      });
      expect(decls).toEqual(["DIAG_SCROLL=isDiagEnabled(process.env.EXPO_PUBLIC_NOTEBUS_DIAG)"]);
    });
  });
});

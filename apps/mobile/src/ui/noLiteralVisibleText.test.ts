import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ALLOWED_EXACT = new Set(["NoteBus"]);

const CHECKED_ATTRS = new Set([
  "title",
  "label",
  "subtitle",
  "detail",
  "placeholder",
  "accessibilityLabel",
  "accessibilityHint",
  "accessibilityValue",
  "aria-label",
  "initialName",
]);

const CHECKED_PROPS = new Set(["initialName", "networkName"]);

const CHECKED_VARS = new Set(["APP_VERSION", "VERSION_TEXT"]);

function getTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getTsxFiles(fullPath));
    } else if (
      entry.name.endsWith(".tsx") &&
      !entry.name.includes(".test.") &&
      !entry.name.toLowerCase().startsWith("diag")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function hasLetters(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  if (!trimmed || ALLOWED_EXACT.has(trimmed)) return false;
  const letters = (trimmed.match(/\p{L}/gu) || []).join("");
  return letters.length >= 2;
}

export function findLiteralVisibleTextViolations(
  source: string,
  fileName = "inline.tsx",
): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const violations: string[] = [];

  function report(text: string, node: ts.Node, context: string) {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    violations.push(`${fileName}:${line + 1} [${context}] "${text}"`);
  }

  function checkExpression(expr: ts.Expression | undefined, context: string) {
    if (!expr) return;
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      if (hasLetters(expr.text)) {
        report(expr.text, expr, context);
      }
    } else if (ts.isTemplateExpression(expr)) {
      if (hasLetters(expr.head.text)) {
        report(expr.head.text, expr.head, context);
      }
      for (const span of expr.templateSpans) {
        if (hasLetters(span.literal.text)) {
          report(span.literal.text, span.literal, context);
        }
        checkExpression(span.expression, context);
      }
    } else if (ts.isConditionalExpression(expr)) {
      checkExpression(expr.whenTrue, context);
      checkExpression(expr.whenFalse, context);
    } else if (ts.isBinaryExpression(expr)) {
      checkExpression(expr.left, context);
      checkExpression(expr.right, context);
    } else if (ts.isParenthesizedExpression(expr)) {
      checkExpression(expr.expression, context);
    }
  }

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (hasLetters(text)) {
        report(text, node, "JsxText");
      }
    } else if (ts.isJsxAttribute(node)) {
      const attrName = node.name.text;
      if (CHECKED_ATTRS.has(attrName) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) {
          if (hasLetters(node.initializer.text)) {
            report(node.initializer.text, node.initializer, `Attr:${attrName}`);
          }
        } else if (ts.isJsxExpression(node.initializer)) {
          checkExpression(node.initializer.expression, `Attr:${attrName}`);
        }
      }
    } else if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(sf);
      if (tag === "Text" || tag.endsWith(".Text")) {
        for (const child of node.children) {
          if (ts.isJsxExpression(child)) {
            checkExpression(child.expression, "TextChild");
          }
        }
      }
    } else if (ts.isPropertyAssignment(node)) {
      const propName = node.name.getText(sf);
      if (CHECKED_PROPS.has(propName)) {
        checkExpression(node.initializer as ts.Expression, `Prop:${propName}`);
      }
    } else if (ts.isVariableDeclaration(node)) {
      const varName = node.name.getText(sf);
      if (CHECKED_VARS.has(varName)) {
        checkExpression(node.initializer, `Var:${varName}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return violations;
}

describe("noLiteralVisibleText", () => {
  it("nenhum texto visível em screens, sheets e ui está fora do catálogo", () => {
    const mobileSrc = join(__dirname, "..");
    const dirs = [
      join(mobileSrc, "screens"),
      join(mobileSrc, "sheets"),
      join(mobileSrc, "ui"),
    ];

    const files = dirs.flatMap(getTsxFiles);
    const violations: string[] = [];

    for (const file of files) {
      const fileName = file.split(/[/\\]/).pop() ?? file;
      const content = readFileSync(file, "utf8");
      const errors = findLiteralVisibleTextViolations(content, fileName);
      violations.push(...errors);
    }

    expect(violations).toEqual([]);
  });

  it("permite o texto exato NoteBus em JsxText", () => {
    const code = `<Text>NoteBus</Text>`;
    expect(findLiteralVisibleTextViolations(code)).toEqual([]);
  });

  it("reprova NoteBus2 em JsxText", () => {
    const code = `<Text>NoteBus2</Text>`;
    const violations = findLiteralVisibleTextViolations(code);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("NoteBus2");
  });

  it("ignora símbolos e glifos sem letras", () => {
    const code = `<Text>+ − → · ▾ 1. 00</Text>`;
    expect(findLiteralVisibleTextViolations(code)).toEqual([]);
  });
});

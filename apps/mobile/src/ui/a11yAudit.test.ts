import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
}

function getUiTsxFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
    .map((name) => join(dir, name));
}

describe("Auditoria de acessibilidade (T-96, D-046, D-047, D-050)", () => {
  const uiDir = __dirname;
  const sheetsDir = join(__dirname, "..", "sheets");

  // 1. Selo de linha com rótulo "Linha n" (D-046)
  it("selo de linha possui rótulo de acessibilidade com 'Linha n' (D-046)", () => {
    const lineBadgePath = join(uiDir, "LineBadge.tsx");
    const source = stripComments(readFileSync(lineBadgePath, "utf-8"));

    expect(source).toMatch(/accessibilityLabel=\{t\("common\.line\.a11y",\s*\{\s*line:\s*code\s*\}\)\}/);
    expect(source).toContain("accessible");
  });

  // 2. A seta de direção oculta do leitor de tela
  it("glifos e setas de direção ficam ocultos da camada de acessibilidade", () => {
    const glyphsPath = join(uiDir, "Glyphs.tsx");
    const source = stripComments(readFileSync(glyphsPath, "utf-8"));

    expect(source).toContain("accessibilityElementsHidden: true");
    expect(source).toContain("importantForAccessibility: \"no-hide-descendants\"");
  });

  // 3. Cada paragem da 'Daqui para a frente' como um elemento com rótulo (D-047)
  it("cada paragem da 'Daqui para a frente' é um único elemento acessível com rótulo (D-047)", () => {
    const aheadSheetPath = join(sheetsDir, "AheadSheet.tsx");
    const source = stripComments(readFileSync(aheadSheetPath, "utf-8"));

    expect(source).toMatch(/accessible\s+accessibilityLabel=\{stopA11y\(row,\s*isHere\)\}/);
  });

  // 4. accessibilityLiveRegion no toast e no cartão 'Em viagem' (D-050)
  it("accessibilityLiveRegion está presente no ToastHost e no TripCard (D-050)", () => {
    const toastPath = join(uiDir, "ToastHost.tsx");
    const toastSource = stripComments(readFileSync(toastPath, "utf-8"));
    expect(toastSource).toContain('accessibilityLiveRegion="polite"');

    const tripCardPath = join(uiDir, "TripCard.tsx");
    const tripCardSource = stripComments(readFileSync(tripCardPath, "utf-8"));
    expect(tripCardSource).toContain('accessibilityLiveRegion="polite"');
    // A prop é só Android (RN 0.86): no iPhone o aviso falado vem de announceForAccessibility, dentro de useEffect (nunca no render).
    expect(tripCardSource).toMatch(/useEffect\(\(\) => \{\s*AccessibilityInfo\.announceForAccessibility\(title\);\s*\}, \[title\]\);/);
  });

  // 5. Todo Pressable em ui/ tem accessibilityLabel ou texto filho
  it("todo Pressable em ui/ possui accessibilityLabel ou texto filho", () => {
    const files = getUiTsxFiles(uiDir);
    const violations: string[] = [];

    for (const file of files) {
      const code = readFileSync(file, "utf-8");
      const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

      function visit(node: ts.Node) {
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tagName = ts.isJsxElement(node)
            ? node.openingElement.tagName.getText(sf)
            : node.tagName.getText(sf);

          if (tagName === "Pressable") {
            const attrs = ts.isJsxElement(node)
              ? node.openingElement.attributes.properties
              : node.attributes.properties;

            const hasA11yLabel = attrs.some((a) => {
              if (ts.isJsxAttribute(a)) {
                const name = a.name.getText(sf);
                return name === "accessibilityLabel" || name === "aria-label";
              }
              return false;
            });

            const isA11yHidden = attrs.some((a) => {
              if (ts.isJsxAttribute(a)) {
                const name = a.name.getText(sf);
                if (name === "accessible") {
                  return a.initializer?.getText(sf) === "{false}";
                }
              }
              return false;
            });

            let hasTextChild = false;
            if (ts.isJsxElement(node)) {
              function checkChildrenForText(childNode: ts.Node) {
                if (
                  (ts.isJsxElement(childNode) || ts.isJsxSelfClosingElement(childNode)) &&
                  (ts.isJsxElement(childNode)
                    ? childNode.openingElement.tagName.getText(sf)
                    : childNode.tagName.getText(sf)) === "Text"
                ) {
                  hasTextChild = true;
                  return;
                }
                ts.forEachChild(childNode, checkChildrenForText);
              }
              ts.forEachChild(node, checkChildrenForText);
            }

            if (!hasA11yLabel && !hasTextChild && !isA11yHidden) {
              const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
              violations.push(`${file}:${line + 1} Pressable sem accessibilityLabel nem Text filho`);
            }
          }
        }
        ts.forEachChild(node, visit);
      }

      ts.forEachChild(sf, visit);
    }

    expect(violations).toEqual([]);
  });

  // 6. Alvo de toque ≥ 44 pt ou hitSlop em controles interativos de ui/
  it("controles interativos em ui/ possuem altura mínima ≥ 44 pt ou hitSlop", () => {
    const files = getUiTsxFiles(uiDir);
    const violations: string[] = [];

    for (const file of files) {
      const code = readFileSync(file, "utf-8");
      const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

      function visit(node: ts.Node) {
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tagName = ts.isJsxElement(node)
            ? node.openingElement.tagName.getText(sf)
            : node.tagName.getText(sf);

          if (tagName === "Pressable") {
            const attrs = ts.isJsxElement(node)
              ? node.openingElement.attributes.properties
              : node.attributes.properties;

            const hasHitSlop = attrs.some(
              (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "hitSlop",
            );

            const isAbsolute = attrs.some(
              (a) =>
                ts.isJsxAttribute(a) &&
                a.name.getText(sf) === "style" &&
                a.initializer?.getText(sf).includes("absoluteFill"),
            );

            // Se tem hitSlop ou preenche tela absoluta, atende o requisito de toque
            if (hasHitSlop || isAbsolute) {
              ts.forEachChild(node, visit);
              return;
            }

            // Verifica se o arquivo define minHeight, height, minTouch (44) ou padding nos estilos
            const fileHasMinTouch =
              code.includes("minTouch") ||
              code.includes("minHeight: 44") ||
              code.includes("height: 44") ||
              code.includes("REGISTER_BUTTON_HEIGHT") ||
              code.includes("hitSlop");

            if (!fileHasMinTouch) {
              const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
              violations.push(`${file}:${line + 1} Pressable sem garantia de alvo ≥ 44 pt`);
            }
          }
        }
        ts.forEachChild(node, visit);
      }

      ts.forEachChild(sf, visit);
    }

    expect(violations).toEqual([]);
  });
});

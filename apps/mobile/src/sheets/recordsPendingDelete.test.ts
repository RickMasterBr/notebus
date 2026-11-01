/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

function parse(rel: string) {
  const code = readFileSync(join(root, rel), "utf8");
  return ts.createSourceFile(rel, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function walk(node: ts.Node, visit: (n: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (c) => walk(c, visit));
}

function jsxName(n: ts.Node, sf: ts.SourceFile): string | null {
  if (ts.isJsxElement(n)) return n.openingElement.tagName.getText(sf);
  if (ts.isJsxSelfClosingElement(n)) return n.tagName.getText(sf);
  return null;
}

function attrText(n: ts.Node, name: string, sf: ts.SourceFile): string | null {
  const props = ts.isJsxElement(n) ? n.openingElement.attributes.properties : (n as ts.JsxSelfClosingElement).attributes.properties;
  const a = props.filter(ts.isJsxAttribute).find((x) => x.name.getText(sf) === name);
  if (!a) return null;
  const init = a.initializer;
  if (!init) return "true";
  return ts.isJsxExpression(init) ? (init.expression?.getText(sf) ?? "") : init.getText(sf);
}

const squash = (s: string | null) => (s ?? "").replace(/\s+/g, "");

const records = parse("sheets/RecordsSheet.tsx");
const swipeRow = parse("sheets/PendingSwipeRow.tsx");

function firstJsx(sf: ts.SourceFile, tag: string): ts.Node | null {
  let found: ts.Node | null = null;
  walk(sf, (n) => {
    if (found === null && jsxName(n, sf) === tag) found = n;
  });
  return found;
}

/** Raiz (return) do componente `name` no arquivo. */
function rootOf(sf: ts.SourceFile, name: string): ts.Node | null {
  let root: ts.Node | null = null;
  walk(sf, (n) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name) {
      walk(n, (m) => {
        if (root === null && ts.isReturnStatement(m) && m.expression) {
          let e: ts.Node = m.expression;
          while (ts.isParenthesizedExpression(e)) e = e.expression;
          root = e;
        }
      });
    }
  });
  return root;
}

describe("Apagar no cartão de Para conferir (recordsPendingDelete)", () => {
  describe("C1 · arrastar e botão Apagar em PendingSwipeRow", () => {
    it("PendingSwipeRow usa ReanimatedSwipeable com renderRightActions e o texto do catálogo", () => {
      const sw = firstJsx(swipeRow, "ReanimatedSwipeable");
      expect(sw).not.toBeNull();
      expect(attrText(sw!, "renderRightActions", swipeRow)).toBe("renderRightActions");
      const code = swipeRow.getText();
      expect(code).toContain('accessibilityLabel={t("sheet_records.action.delete")}');
      expect(code).toContain("pressedStyle(pressed)");
      expect(squash(attrText(sw!, "onSwipeableWillOpen", swipeRow))).toBe("handleWillOpen");
    });
    it("RecordsSheet envolve PendingCardView em PendingSwipeRow com o coordenador de arrastar", () => {
      const row = firstJsx(records, "PendingSwipeRow");
      expect(row).not.toBeNull();
      expect(attrText(row!, "onWillOpen", records)).toBe("handleSwipeableWillOpen");
      expect(attrText(row!, "onClose", records)).toBe("handleSwipeableClose");
      expect(row!.getText(records)).toContain("<PendingCardView");
    });
    it("a raiz do PendingCardView continua sendo o Pressable", () => {
      const r = rootOf(records, "PendingCardView");
      expect(r).not.toBeNull();
      expect(jsxName(r!, records)).toBe("Pressable");
    });
  });

  describe("C2 · Apagar chama handleDeleteSingle com o id do registro", () => {
    it("PendingSwipeRow recebe onDelete={handleDeleteSingle} e id={item.row.id}", () => {
      const row = firstJsx(records, "PendingSwipeRow");
      expect(row).not.toBeNull();
      expect(attrText(row!, "onDelete", records)).toBe("handleDeleteSingle");
      expect(attrText(row!, "id", records)).toBe("item.row.id");
    });
    it("o botão Apagar fecha o cartão e chama onDelete(id)", () => {
      expect(squash(swipeRow.getText())).toContain("methods.close();onDelete(id);");
    });
  });

  describe("C3 · VoiceOver ganha Apagar depois de Não sei, e o toque continua abrindo Conferir", () => {
    const r = rootOf(records, "PendingCardView");
    it("accessibilityActions: dismiss e depois delete", () => {
      expect(squash(attrText(r!, "accessibilityActions", records))).toBe(
        '[{name:"dismiss",label:t("sheet_records.pending.unsure")},{name:"delete",label:t("sheet_records.action.delete")}]',
      );
    });
    it("onAccessibilityAction chama onDelete(row.id) em delete", () => {
      expect(squash(attrText(r!, "onAccessibilityAction", records))).toContain('if(action==="delete")onDelete(row.id);');
    });
    it("PendingCardView recebe onDelete={handleDeleteSingle}", () => {
      const card = firstJsx(records, "PendingCardView");
      expect(attrText(card!, "onDelete", records)).toBe("handleDeleteSingle");
    });
    it("onPress da raiz continua onCheck(row)", () => {
      expect(squash(attrText(r!, "onPress", records))).toBe("()=>onCheck(row)");
    });
  });
});

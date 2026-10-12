/// <reference types="node" />
/**
 * Guardas de ligação do E-08 bloco 11: confere o USO no texto-fonte.
 * (Rolagem, teclado, toque e VoiceOver só o iPhone decide).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => text.replace(/\s+/g, " ");

const sheetHost = squash(read("sheets/SheetHost.tsx"));
const networkSheet = squash(read("sheets/NetworkSheet.tsx"));
const lineEditSheet = squash(read("sheets/LineEditSheet.tsx"));

describe("E-08 bloco 11 Item 4: guardas de ligação da Nova linha", () => {
  it("SheetHost.tsx: entry.lineId === NEW_LINE_ID escolhe LineEditSheet e LineDetailSheet no outro ramo", () => {
    expect(sheetHost).toContain(
      'if (entry.kind === "lineDetail" && entry.lineId === NEW_LINE_ID) { return <LineEditSheet id={entry.id} />; }',
    );
    expect(sheetHost).toContain(
      'case "lineDetail": return <LineDetailSheet id={entry.id} lineId={entry.lineId} />;',
    );
  });

  it("NetworkSheet.tsx: item newLine tem onPress ligado ao handler que empurra lineDetail com NEW_LINE_ID", () => {
    expect(networkSheet).toContain(
      'if (item.type === "newLine") { return ( <Pressable accessibilityRole="button" accessibilityLabel={t("net.line.new")} onPress={handleNewLinePress}',
    );
    expect(networkSheet).toContain(
      'const handleNewLinePress = useCallback(() => { dispatch({ type: "push", sheet: { kind: "lineDetail", lineId: NEW_LINE_ID } }); }, [dispatch]);',
    );
  });

  it("LineEditSheet.tsx: createLine(db, buildLineDraft( com o resultado atribuído", () => {
    expect(lineEditSheet).toContain(
      "const result = await createLine(db, buildLineDraft(state), now());",
    );
  });

  it("LineEditSheet.tsx: lineRefusalText usado no ramo de falha", () => {
    expect(lineEditSheet).toContain(
      "const refusal = lineRefusalText(firstReason);",
    );
    expect(lineEditSheet).toContain(
      "const refusal = lineRefusalText(result.reason);",
    );
  });

  it("LineEditSheet.tsx: view.canSave ligado a disabled do botão Criar", () => {
    expect(lineEditSheet).toContain("disabled={!view.canSave}");
    expect(lineEditSheet).toContain("accessibilityState={{ disabled: !view.canSave }}");
    expect(lineEditSheet).toContain("{t(\"line_create.button.save\")}");
  });

  it("LineEditSheet.tsx: view.showMadrugadaHint consumido no JSX", () => {
    expect(lineEditSheet).toContain(
      '{view.showMadrugadaHint ? ( <Text style={[type.caption, { color: colors.textSecondary }]}> {t("line_create.madrugada_hint")}',
    );
  });

  it("LineEditSheet.tsx: view.stopRows iterado com canMoveUp e canMoveDown no disabled dos botões", () => {
    expect(lineEditSheet).toContain(
      "{view.stopRows.map((row) => (",
    );
    expect(lineEditSheet).toContain(
      "disabled={!row.canMoveUp}",
    );
    expect(lineEditSheet).toContain(
      "disabled={!row.canMoveDown}",
    );
  });
});

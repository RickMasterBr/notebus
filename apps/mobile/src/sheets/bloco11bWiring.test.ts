/// <reference types="node" />
/**
 * Guardas de ligação do E-08 bloco 11b (Item 4):
 * Protege o uso de apagar linha e localização opcional no novo ponto.
 * Puro: confere o código-fonte (uso e fiação), sem renderizar React.
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

const networkSheet = squash(read("sheets/NetworkSheet.tsx"));
const stopEditSheet = squash(read("sheets/StopEditSheet.tsx"));

describe("bloco11bWiring: guardas de ligação (Item 4)", () => {
  describe("NetworkSheet.tsx: apagar linha", () => {
    it("LineRow recebe onDelete={(line) => void handleDeleteLine(line)}", () => {
      expect(networkSheet).toContain(
        "<LineRow line={item.line} onPress={handleLinePress} onDelete={(line) => void handleDeleteLine(line)}",
      );
    });

    it("LineRow usa isDeleteAction e chama onDelete(line)", () => {
      expect(networkSheet).toContain(
        "if (isDeleteAction(event.nativeEvent.actionName)) onDelete(line);",
      );
    });

    it("LineRow define accessibilityActions com name 'delete' e rótulo line_delete.action", () => {
      expect(networkSheet).toContain(
        'accessibilityActions={[{ name: "delete", label: t("line_delete.action") }]}',
      );
    });

    it("deleteLine(db, item.id, now()) tem o resultado atribuído", () => {
      expect(networkSheet).toContain(
        "const result = await deleteLine(db, item.id, now());",
      );
    });

    it("lineDeleteRefusalText usado no ramo de falha", () => {
      expect(networkSheet).toContain(
        'lineDeleteRefusalText(result.reason, "usage" in result ? result.usage : undefined)',
      );
    });

    it("await reloadAll() chamado após apagar linha e no Desfazer", () => {
      expect(networkSheet).toContain(
        "const result = await deleteLine(db, item.id, now()); if (!result.ok) { const text = lineDeleteRefusalText(result.reason, \"usage\" in result ? result.usage : undefined); toast.show({ title: t(text.key, text.params), kind: \"error\", haptic: \"error\" }); return; } await reloadAll();",
      );
    });

    it("result.undo(now()) chamado no Desfazer da linha apagada", () => {
      expect(networkSheet).toContain(
        'title: t("line_delete.done"), haptic: "success", action: { label: t("toast.action.undo"), run: async () => { const undone = await result.undo(now()); await reloadAll();',
      );
    });
  });

  describe("StopEditSheet.tsx: localização no novo ponto", () => {
    it("createStop no ramo isNew usa buildNewStopValues com draft, committed.aliases e location", () => {
      expect(stopEditSheet).toContain(
        "const result = isNew ? await createStop( db, buildNewStopValues(draft, committed.aliases, location), nowMs, ) :",
      );
    });

    it("newStopLocationView consome locationView.statusKey e locationView.canRemove ?", () => {
      expect(stopEditSheet).toContain(
        "const locationView = newStopLocationView(location);",
      );
      expect(stopEditSheet).toContain(
        "t(locationView.statusKey)",
      );
      expect(stopEditSheet).toContain(
        "{locationView.canRemove ? ( <Pressable",
      );
    });

    it("MapPicker recebe existing={location} e onConfirm que grava o ponto", () => {
      expect(stopEditSheet).toContain(
        "<MapPicker visible={pickerVisible} existing={location} onCancel={() => setPickerVisible(false)} onConfirm={(point) => { setLocation(point); setPickerVisible(false); }}",
      );
    });
  });
});

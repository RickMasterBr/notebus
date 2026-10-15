/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 3 (Item 5):
 * Confere o USO no texto-fonte de LineEditSheet.tsx e StopEditSheet.tsx.
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

const lineEditSheet = squash(read("sheets/LineEditSheet.tsx"));
const stopEditSheet = squash(read("sheets/StopEditSheet.tsx"));

describe("E-08.5 bloco 3 Item 5: guardas de ligação", () => {
  describe("LineEditSheet.tsx", () => {
    it("1. view.stopRows iterado com StopOrderRow recebendo row, total e onMove", () => {
      expect(lineEditSheet).toContain(
        "{view.stopRows.map((row) => ( <StopOrderRow",
      );
      expect(lineEditSheet).toContain(
        "row={row} total={view.stopRows.length} onMove={moveStopRow}",
      );
    });

    it("2. moveStopRow chama moveStopTo(prev.stops, from, to) dentro de setState", () => {
      expect(lineEditSheet).toContain(
        "const moveStopRow = (from: number, to: number) => setState((prev) => ({ ...prev, stops: moveStopTo(prev.stops, from, to) }));",
      );
    });

    it("3. StopOrderRow: .activeOffsetY([-6, 6]), runOnJS(onDrop) com dois argumentos, dragTargetIndex e destino diferente", () => {
      expect(lineEditSheet).toContain(".activeOffsetY([-6, 6])");
      expect(lineEditSheet).toContain("runOnJS(onDrop)(event.translationY, itemHeight.value)");
      expect(lineEditSheet).toContain("dragTargetIndex({ index: row.index, translationY, rowHeight, total })");
      expect(lineEditSheet).toContain("if (target !== row.index) { onMove(row.index, target); translateY.value = releaseStart(translationY, row.index, target, rowHeight);");
    });

    it("4. accessibilityActions consumindo a.name e t(a.labelKey), stopActionTarget e onMove se não for null", () => {
      expect(lineEditSheet).toContain(
        "accessibilityActions={row.actions.map((a) => ({ name: a.name, label: t(a.labelKey) }))}",
      );
      expect(lineEditSheet).toContain(
        "const target = stopActionTarget(event.nativeEvent.actionName, row.index); if (target !== null) { onMove(row.index, target); }",
      );
    });

    it("5. botão Remover fora da View accessible do nome, com onRemove(row.index) e removeStop na lista", () => {
      expect(lineEditSheet).toContain(
        '</View> <Pressable accessibilityRole="button" accessibilityLabel={t("line_create.stop.remove")} onPress={() => onRemove(row.index)}',
      );
      expect(lineEditSheet).toContain(
        "onRemove={(index) => setState((prev) => ({ ...prev, stops: removeStop(prev.stops, index) }))",
      );
    });

    it("6. nenhum Pressable com Subir ou Descer no accessibilityLabel", () => {
      expect(lineEditSheet).not.toContain('accessibilityLabel={t("line_create.stop.move_up")}');
      expect(lineEditSheet).not.toContain('accessibilityLabel={t("line_create.stop.move_down")}');
    });

    it("7. stopsNoteText com stops na mesma linha, stopsProblemText e missingText no rodapé antes do botão Criar", () => {
      expect(lineEditSheet).toContain(
        '{t("line_create.stops")} </Text> <Text style={[type.caption, { color: colors.textSecondary }]}> {view.stopsNoteText}',
      );
      expect(lineEditSheet).toContain("{view.stopsProblemText !== null ? (");
      expect(lineEditSheet).toContain("{view.missingText !== null ? (");

      const footerIdx = lineEditSheet.indexOf("styles.footer");
      const missingIdx = lineEditSheet.indexOf("{view.missingText !== null ? (", footerIdx);
      const saveBtnIdx = lineEditSheet.indexOf('{t("line_create.button.save")}', footerIdx);
      expect(missingIdx).toBeGreaterThan(footerIdx);
      expect(missingIdx).toBeLessThan(saveBtnIdx);
    });

    it("8. footerTotalHeight, footerTotal no height do rodapé e em placeSheetFrame, e placeFooterHeight intacto", () => {
      expect(lineEditSheet).toContain(
        "footerTotalHeight({ base: footerHeight, noteHeight: missingNoteHeight, noteVisible: view.missingText !== null, })",
      );
      expect(lineEditSheet).toContain(
        "placeSheetFrame({ scrollAreaHeight, footerHeight: footerTotal, })",
      );
      expect(lineEditSheet).toContain(
        "height: footerTotal, borderTopColor: colors.divider,",
      );
      expect(lineEditSheet).toContain(
        "placeFooterHeight({ minTouch, space, bottomInset: insets.bottom, })",
      );
    });
  });

  describe("StopEditSheet.tsx", () => {
    it("locationButtonsRow sem flexWrap", () => {
      const start = stopEditSheet.indexOf("locationButtonsRow:");
      const end = stopEditSheet.indexOf("locationButton:");
      const locStyle = stopEditSheet.substring(start, end);
      expect(locStyle).not.toContain("flexWrap");
    });

    it("locationButton com alignSelf: 'stretch' e minHeight: minTouch", () => {
      expect(stopEditSheet).toContain(
        'locationButton: { minHeight: minTouch, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.md, justifyContent: "center", alignItems: "center", alignSelf: "stretch", }',
      );
    });

    it("os dois botões usam styles.locationButton", () => {
      const matches = stopEditSheet.match(/styles\.locationButton\b/g) ?? [];
      expect(matches).toHaveLength(2);
    });
  });

  describe("Item 0: lacunas do guarda do bloco 3", () => {
    it("M1. a View do nome acessível contígua", () => {
      expect(lineEditSheet).toContain(
        "<View accessible accessibilityLabel={labelText} accessibilityActions=",
      );
    });

    it("M2. o 'Falta' mede a altura no rodapé", () => {
      expect(lineEditSheet).toContain(
        "{view.missingText !== null ? ( <Text onLayout={(e) => setMissingNoteHeight(e.nativeEvent.layout.height)}",
      );
    });

    it("M3. o gesto pan está na alça", () => {
      expect(lineEditSheet).toContain(
        "<GestureDetector gesture={pan}> <View style={styles.dragHandleHitTarget}",
      );
    });

    it("M4. runOnJS no onEnd e não no onUpdate", () => {
      const updateIdx = lineEditSheet.indexOf(".onUpdate(");
      const endIdx = lineEditSheet.indexOf(".onEnd(", updateIdx);
      const finalizeIdx = lineEditSheet.indexOf(".onFinalize(", endIdx);
      const updateBlock = lineEditSheet.substring(updateIdx, endIdx);
      const endBlock = lineEditSheet.substring(endIdx, finalizeIdx);
      expect(endBlock).toContain(
        "runOnJS(onDrop)(event.translationY, itemHeight.value)",
      );
      expect(updateBlock).not.toContain("runOnJS");
    });

    it("M5. a alça escondida do VoiceOver", () => {
      expect(lineEditSheet).toContain(
        'style={styles.dragHandleHitTarget} accessibilityElementsHidden={true} importantForAccessibility="no" > <DragHandleGlyph',
      );
    });

    it("M6. o estilo animado aplicado na Animated.View", () => {
      expect(lineEditSheet).toContain(
        "<Animated.View style={animatedStyle} onLayout=",
      );
    });

    it("M7. a chave StopOrderRow com row.id e row.index", () => {
      expect(lineEditSheet).toContain(
        '<StopOrderRow key={`${row.id}-${row.index}`}',
      );
    });

    it("M8. a altura medida dentro do onLayout da Animated.View", () => {
      const animStart = lineEditSheet.indexOf("<Animated.View style={animatedStyle} onLayout=");
      const stopRowIdx = lineEditSheet.indexOf("<View style={[styles.stopRow", animStart);
      const animTag = lineEditSheet.substring(animStart, stopRowIdx);
      expect(animTag).toContain(
        "itemHeight.value = e.nativeEvent.layout.height + space.xs;",
      );
      expect(lineEditSheet).toContain(
        "<Animated.View style={animatedStyle} onLayout={(e) => { itemHeight.value = e.nativeEvent.layout.height + space.xs; }}",
      );
    });
  });
});


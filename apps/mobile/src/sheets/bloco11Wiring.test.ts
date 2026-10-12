/// <reference types="node" />
/**
 * Guardas de ligação do E-08 bloco 11 / bloco 11b: confere o USO no texto-fonte.
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

  it("LineEditSheet.tsx: applyPickedTime dentro do commitPickerTime", () => {
    expect(lineEditSheet).toContain(
      "setState((prev) => applyPickedTime(prev, pickerTarget, hour, minute));",
    );
  });

  it("LineEditSheet.tsx: pickerInitialMinute em openTimePicker", () => {
    expect(lineEditSheet).toContain(
      "pickerInitialMinute(state, target)",
    );
  });

  it("LineEditSheet.tsx: setMode no botão Frequência e no botão Avulsos", () => {
    expect(lineEditSheet).toContain(
      'label={t("line_create.mode.departures")} selected={state.mode === "departures"} onPress={() => setState((prev) => setMode(prev, "departures"))}',
    );
    expect(lineEditSheet).toContain(
      'label={t("line_create.mode.frequency")} selected={state.mode === "frequency"} onPress={() => setState((prev) => setMode(prev, "frequency"))}',
    );
  });

  it("LineEditSheet.tsx: toggleDayType nos chips de dia", () => {
    expect(lineEditSheet).toContain(
      "onPress={() => setState((prev) => toggleDayType(prev, code))}",
    );
  });

  it("LineEditSheet.tsx: moveStop no botão Subir ('up') e no Descer ('down')", () => {
    expect(lineEditSheet).toContain(
      'accessibilityLabel={t("line_create.stop.move_up")} disabled={!row.canMoveUp} accessibilityState={{ disabled: !row.canMoveUp }} onPress={() => setState((prev) => ({ ...prev, stops: moveStop(prev.stops, row.index, "up") }))}',
    );
    expect(lineEditSheet).toContain(
      'accessibilityLabel={t("line_create.stop.move_down")} disabled={!row.canMoveDown} accessibilityState={{ disabled: !row.canMoveDown }} onPress={() => setState((prev) => ({ ...prev, stops: moveStop(prev.stops, row.index, "down") }))}',
    );
  });

  it("LineEditSheet.tsx: submitLineForm(db, state, now()) com resultado em outcome", () => {
    expect(lineEditSheet).toContain(
      "const outcome = await submitLineForm(db, state, now());",
    );
  });

  it("LineEditSheet.tsx: outcome.undo(now()) no Desfazer", () => {
    expect(lineEditSheet).toContain(
      "const undone = await outcome.undo(now());",
    );
  });

  it("LineEditSheet.tsx: reloadSchedule seguido de close no ramo created", () => {
    expect(lineEditSheet).toContain(
      "if (outcome.kind === \"created\") { await reloadStopIndex(); await reloadSchedule(); close();",
    );
  });

  it("LineEditSheet.tsx: view.canSave ligado a disabled do botão Criar", () => {
    expect(lineEditSheet).toContain("disabled={!view.canSave}");
    expect(lineEditSheet).toContain("accessibilityState={{ disabled: !view.canSave }}");
    expect(lineEditSheet).toContain('{t("line_create.button.save")}');
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

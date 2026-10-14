/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 8 (Itens 2 e 3):
 * Confere o USO no texto-fonte de StopEditSheet.tsx (F2: layout em coluna, F3: localização no Editar ponto).
 * (Rolagem, teclado, toque e VoiceOver só o iPhone decide).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (...path: string[]) =>
  readFileSync(join(root, ...path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");

function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  if (from === -1) return "";
  const to = text.indexOf(end, from);
  return to === -1 ? "" : text.slice(from, to);
}

const sheet = read("sheets", "StopEditSheet.tsx");

describe("E-08.5 bloco 8 guardas de ligação (StopEditSheet.tsx)", () => {
  it("G1: o estilo dos botões é coluna: locationButtonsRow sem row nem flexWrap; locationButton com alignSelf stretch e minHeight minTouch", () => {
    const locButtonsRow = between(sheet, "locationButtonsRow: {", "},");
    expect(
      locButtonsRow,
      "G1: locationButtonsRow não deve ter flexDirection: 'row'",
    ).not.toContain('flexDirection: "row"');
    expect(
      locButtonsRow,
      "G1: locationButtonsRow não deve ter flexWrap",
    ).not.toContain("flexWrap");

    const locBtnStyle = between(sheet, "locationButton: {", "},");
    expect(
      locBtnStyle,
      "G1: locationButton contém alignSelf: 'stretch'",
    ).toContain('alignSelf: "stretch"');
    expect(
      locBtnStyle,
      "G1: locationButton contém minHeight: minTouch",
    ).toContain("minHeight: minTouch");
  });

  it("G2: não existem locationButtonHalf, smallActionButton nem flex: 1 no recorte dos estilos de localização", () => {
    const stylesSection = between(sheet, "locationButtonsRow: {", "footer: {");
    expect(
      stylesSection,
      "G2: não deve existir locationButtonHalf",
    ).not.toContain("locationButtonHalf");
    expect(
      stylesSection,
      "G2: não deve existir smallActionButton",
    ).not.toContain("smallActionButton");
    expect(
      stylesSection,
      "G2: não deve existir flex: 1",
    ).not.toContain("flex: 1");
  });

  it("G3: os dois Pressable (map_pick.open.stop.a11y e stop_new.location.remove) usam styles.locationButton dentro do próprio elemento", () => {
    const pickIdx = sheet.indexOf('accessibilityLabel={t("map_pick.open.stop.a11y")}');
    expect(pickIdx, "G3: accessibilityLabel map_pick.open.stop.a11y não achado").toBeGreaterThan(-1);
    const pickEl = sheet.substring(sheet.lastIndexOf("<Pressable", pickIdx), sheet.indexOf("</Pressable>", pickIdx));
    expect(pickEl, "G3: botão Marcar usa styles.locationButton no mesmo elemento").toContain("styles.locationButton");

    const removeIdx = sheet.indexOf('accessibilityLabel={t("stop_new.location.remove")}');
    expect(removeIdx, "G3: accessibilityLabel stop_new.location.remove não achado").toBeGreaterThan(-1);
    const removeEl = sheet.substring(sheet.lastIndexOf("<Pressable", removeIdx), sheet.indexOf("</Pressable>", removeIdx));
    expect(removeEl, "G3: botão Remover usa styles.locationButton no mesmo elemento").toContain("styles.locationButton");
  });

  it("G4: o Remover só aparece com {locationView.canRemove ? ( <Pressable e tem onPress={() => setLocation(null)} no mesmo elemento; setLocation(null) aparece uma vez só", () => {
    expect(
      sheet,
      "G4: Remover só aparece com {locationView.canRemove ? ( <Pressable",
    ).toContain("{locationView.canRemove ? ( <Pressable");

    const removeIdx = sheet.indexOf('accessibilityLabel={t("stop_new.location.remove")}');
    expect(removeIdx, "G4: accessibilityLabel stop_new.location.remove não achado").toBeGreaterThan(-1);
    const removeEl = sheet.substring(sheet.lastIndexOf("<Pressable", removeIdx), sheet.indexOf("</Pressable>", removeIdx));
    expect(
      removeEl,
      "G4: Remover tem onPress={() => setLocation(null)} dentro do mesmo elemento",
    ).toContain("onPress={() => setLocation(null)}");

    const setNullCount = sheet.split("setLocation(null)").length - 1;
    expect(setNullCount, "G4: setLocation(null) aparece uma vez só no arquivo").toBe(1);
  });

  it("G5: o load() do ramo de edição chama setLocation(row.lat !== null && row.lon !== null ? { lat: row.lat, lon: row.lon } : null)", () => {
    expect(
      sheet,
      "G5: load() chama setLocation com lat e lon da linha",
    ).toContain("setLocation(row.lat !== null && row.lon !== null ? { lat: row.lat, lon: row.lon } : null);");
  });

  it("G6: const locationView = stopLocationView(locationInfo, location); contíguo", () => {
    expect(
      sheet,
      "G6: locationView contíguo chamando stopLocationView(locationInfo, location)",
    ).toContain("const locationView = stopLocationView(locationInfo, location);");
  });

  it("G7: stopEditView({ leva locationChanged: locationView.changed", () => {
    const stopEditViewCall = between(sheet, "stopEditView({", "});");
    expect(
      stopEditViewCall,
      "G7: stopEditView recebe locationChanged: locationView.changed",
    ).toContain("locationChanged: locationView.changed");
  });

  it("G8: chamada saveStopEdit contígua com quinto campo location: locationEdit(locationInfo, location)", () => {
    expect(
      sheet,
      "G8: saveStopEdit contíguo com locationEdit(locationInfo, location)",
    ).toContain(
      "await saveStopEdit( db, stopId, { name: draft.name, aliases: committed.aliases, externalId: draft.externalId, note: draft.note, location: locationEdit(locationInfo, location), }, nowMs, );",
    );
  });

  it("G9: no sucesso, reloadSchedule e locations.reload contíguos; no run do Desfazer, contíguos antes de if (!undone.ok)", () => {
    const successBlock = between(sheet, "if (result.ok) {", "close();");
    expect(
      successBlock,
      "G9: sucesso chama reloadSchedule e locations.reload contíguos",
    ).toContain("await reloadSchedule(); await locations.reload();");

    const undoBlock = between(sheet, "run: async () => {", "if (!undone.ok)");
    expect(
      undoBlock,
      "G9: undo chama reloadSchedule e locations.reload contíguos antes de if (!undone.ok)",
    ).toContain("await reloadSchedule(); await locations.reload();");
  });

  it("G10: o MapPicker continua <MapPicker visible={pickerVisible} existing={location} onCancel={() => setPickerVisible(false)} onConfirm={(point) => { setLocation(point); setPickerVisible(false); }} contíguo", () => {
    expect(
      sheet,
      "G10: MapPicker contíguo com existing={location}",
    ).toContain(
      "<MapPicker visible={pickerVisible} existing={location} onCancel={() => setPickerVisible(false)} onConfirm={(point) => { setLocation(point); setPickerVisible(false); }}",
    );
  });

  it("G11: o botão Marcar no mapa tem accessibilityLabel={t('map_pick.open.stop.a11y')} onPress={() => setPickerVisible(true)} no mesmo elemento", () => {
    const pickIdx = sheet.indexOf('accessibilityLabel={t("map_pick.open.stop.a11y")}');
    expect(pickIdx, "G11: accessibilityLabel map_pick.open.stop.a11y não achado").toBeGreaterThan(-1);
    const pickEl = sheet.substring(sheet.lastIndexOf("<Pressable", pickIdx), sheet.indexOf("</Pressable>", pickIdx));
    expect(
      pickEl,
      "G11: botão Marcar tem accessibilityLabel e onPress no mesmo elemento",
    ).toContain('accessibilityLabel={t("map_pick.open.stop.a11y")} onPress={() => setPickerVisible(true)}');
  });
});

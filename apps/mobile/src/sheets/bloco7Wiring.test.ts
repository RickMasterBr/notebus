/// <reference types="node" />
/**
 * Guardas de ligação do E-08 bloco 7: confere o USO no texto-fonte (arrastar, toque, aparência e VoiceOver só o aparelho decide).
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

const declareSheet = squash(read("sheets/DeclareSheet.tsx"));
const overrideSheet = squash(read("sheets/OverrideSheet.tsx"));
const recordSheet = squash(read("sheets/RecordSheet.tsx"));
const stopCardView = squash(read("ui/StopCardView.tsx"));

const pickerBlock = (source: string, visibleProp: string) => {
  const match = source.match(new RegExp(`<PickerModal visible=\\{${visibleProp}\\}.*?> <DateTimePicker`));
  return match?.[0] ?? "";
};

describe("item 0: lacunas das mutações do bloco 6", () => {
  it("0.1: o Pronto do seletor de hora do DeclareSheet grava a hora escolhida e fecha o seletor", () => {
    expect(declareSheet).toContain(
      "onDone={() => { setHour({ hour: pickerDate.getHours(), minute: pickerDate.getMinutes() }); setShowPicker(false); }}",
    );
  });

  it("0.2: o fechar do PickerModal do DeclareSheet fecha o seletor", () => {
    expect(pickerBlock(declareSheet, "showPicker")).toContain("onClose={() => setShowPicker(false)}");
  });

  it("0.3: o PickerModal do OverrideSheet abre e fecha pelo estado e o Pronto fecha", () => {
    const block = pickerBlock(overrideSheet, "showDatePicker");
    expect(block).toContain("onClose={() => setShowDatePicker(false)}");
    expect(block).toContain("onDone={() => setShowDatePicker(false)}");
  });

  it("0.4: o PickerModal do RecordSheet fecha pelo fechar e pelo Pronto", () => {
    const block = pickerBlock(recordSheet, "showPicker");
    expect(block).toContain("onClose={() => setShowPicker(false)}");
    expect(block).toContain("onDone={() => setShowPicker(false)}");
  });

  it("0.5: o cartão do ponto monta o rótulo com cardLabel e usa o mesmo rótulo nos dois ramos", () => {
    expect(stopCardView).toContain("const a11yLabel = cardLabel(cardA11y(card, subtitle), aliases);");
    expect(stopCardView.match(/accessibilityLabel=\{a11yLabel\}/g)).toHaveLength(2);
  });
});

const networkSheet = squash(read("sheets/NetworkSheet.tsx"));
const stopEditSheet = squash(read("sheets/StopEditSheet.tsx"));

describe("item 3: Novo ponto", () => {
  it("a linha + Novo ponto é um botão e o toque abre a folha de edição com NEW_STOP_ID", () => {
    expect(networkSheet).toContain(
      'if (item.type === "newStop") { return ( <Pressable accessibilityRole="button" accessibilityLabel={t("net.stop.new")} onPress={handleNewStopPress}',
    );
    expect(networkSheet).toContain(
      'const handleNewStopPress = useCallback(() => { dispatch({ type: "push", sheet: { kind: "stopEdit", stopId: NEW_STOP_ID } }); }, [dispatch]);',
    );
  });

  it("a linha nova entra na lista logo sob o cabeçalho Pontos", () => {
    expect(networkSheet).toContain(
      'title: t("net.section.stops"), }); items.push({ type: "newStop", id: "new-stop" });',
    );
  });

  it("a folha chama createStop só no modo novo e saveStopEdit só no modo edição, cada um no seu ramo", () => {
    expect(stopEditSheet).toContain(
      "const result = isNew ? await createStop(db, values, nowMs) : await saveStopEdit(db, stopId, values, nowMs);",
    );
    expect(stopEditSheet.match(/createStop\(/g)).toHaveLength(1);
    expect(stopEditSheet.match(/saveStopEdit\(/g)).toHaveLength(1);
  });

  it("depois de criar, a busca e os horários recarregam e o toast traz o Desfazer", () => {
    expect(stopEditSheet).toContain(
      'if (result.ok) { await reloadStopIndex(); await reloadSchedule(); close(); toast.show({ title: isNew ? t("stop_new.saved") : t("stop_edit.toast.saved"), haptic: "success", action: { label: t("toast.action.undo"),',
    );
  });

  it("o Desfazer da criação chama result.undo, recarrega e, se falhar, mostra o erro", () => {
    expect(stopEditSheet).toContain(
      'run: async () => { const undone = await result.undo(now()); await reloadStopIndex(); await reloadSchedule(); if (!undone.ok) { toast.show({ title: t("stop_edit.error.stale"), kind: "error", haptic: "error", }); } },',
    );
  });

  it("a recusa no_network vira um toast de erro", () => {
    expect(stopEditSheet).toContain(
      '} else if (result.reason === "no_network") { toast.show({ title: t("stop_new.error.no_network"), kind: "error", haptic: "error" });',
    );
  });
});

describe("item 3: apagar ponto arrastando", () => {
  it("o botão Apagar fecha a linha e apaga o ponto da linha", () => {
    expect(networkSheet).toContain(
      'onPress={() => { swipeableMethods.close(); onDelete(stop); }}',
    );
    expect(networkSheet).toContain("onDelete={(stop) => void handleDelete(stop)}");
  });

  it("apagar chama deleteStop e mostra o texto da recusa com o motivo e o uso do resultado", () => {
    expect(networkSheet).toContain(
      'const result = await deleteStop(db, item.id, now()); if (!result.ok) { const text = deleteRefusalText(result.reason, "usage" in result ? result.usage : undefined); toast.show({ title: t(text.key, text.params), kind: "error", haptic: "error" }); return; }',
    );
  });

  it("apagou: recarrega, avisa com Desfazer, e o Desfazer chama result.undo, recarrega e mostra o erro se falhar", () => {
    expect(networkSheet).toContain(
      'await reloadAll(); toast.show({ title: t("stop_delete.done"), haptic: "success", action: { label: t("toast.action.undo"), run: async () => { const undone = await result.undo(now()); await reloadAll(); if (!undone.ok) { toast.show({ title: t("stop_edit.error.stale"), kind: "error", haptic: "error" }); } }, }, });',
    );
  });

  it("a recarga lê o índice de busca, os horários e a lista", () => {
    expect(networkSheet).toContain(
      "const reloadAll = useCallback(async () => { await reloadStopIndex(); await reloadSchedule(); await loadData(); }, [reloadStopIndex, reloadSchedule, loadData]);",
    );
  });
});

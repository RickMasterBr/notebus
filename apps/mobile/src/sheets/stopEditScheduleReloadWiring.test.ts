/// <reference types="node" />
/**
 * Item 9 do bloco 5 (E-08): depois de editar o ponto (salvar e Desfazer), os horários são recarregados, porque o nome do
 * ponto que as outras folhas mostram vem de `schedule.data.stopNames`.
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

const stopEditSheet = read("sheets/StopEditSheet.tsx");

describe("StopEditSheet recarrega os horários", () => {
  it("usa o reload do ScheduleProvider", () => {
    expect(stopEditSheet).toContain('import { useScheduleReload } from "../data/ScheduleProvider";');
    expect(stopEditSheet).toContain("const reloadSchedule = useScheduleReload();");
  });

  it("depois de salvar com sucesso: recarrega o índice e os horários antes de fechar a folha", () => {
    const ok = stopEditSheet.indexOf("if (result.ok) {");
    const idx = stopEditSheet.indexOf("await reloadStopIndex();", ok);
    const sched = stopEditSheet.indexOf("await reloadSchedule();", ok);
    const close = stopEditSheet.indexOf("close();", ok);
    expect(ok).toBeGreaterThan(-1);
    expect(sched).toBeGreaterThan(idx);
    expect(close).toBeGreaterThan(sched);
  });

  it("no Desfazer: recarrega os horários depois de desfazer e antes do aviso de erro", () => {
    const undo = stopEditSheet.indexOf("const undone = await result.undo(now());");
    const sched = stopEditSheet.indexOf("await reloadSchedule();", undo);
    const stale = stopEditSheet.indexOf("if (!undone.ok)", undo);
    expect(undo).toBeGreaterThan(-1);
    expect(sched).toBeGreaterThan(undo);
    expect(stale).toBeGreaterThan(sched);
  });
});

describe("quem lê o nome do ponto pelos horários (cobertos pelo reload)", () => {
  const readers = [
    "sheets/AlightPickerSheet.tsx",
    "sheets/BoardSheet.tsx",
    "sheets/GotoSheet.tsx",
    "sheets/OptionSheet.tsx",
    "sheets/RecordSheet.tsx",
    "sheets/RouteSheet.tsx",
    "sheets/VerifySheet.tsx",
    "data/ahead.ts",
    "data/stopCard.ts",
  ];
  it.each(readers)("%s lê o nome de stopNames do snapshot dos horários", (file) => {
    expect(read(file)).toMatch(/stopNames\.get\(/);
  });
});

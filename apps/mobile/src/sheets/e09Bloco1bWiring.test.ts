/// <reference types="node" />
/**
 * Guardas de ligação do E-09 bloco 1b (só teste): cada regex confere o USO no ponto certo
 * (campo, argumento, prop no elemento certo, handler no elemento certo), não só a presença da chamada.
 * Ajustes (S1 a S15), Guia do Início (H3 a H11), Busca (SE5), Por que (A1 a A4, SH1, W1 a W4).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTapCounter } from "../data/testClockPicker";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => text.replace(/\s+/g, " ");

describe("E-09 bloco 1b: SettingsSheet", () => {
  const settings = squash(read("sheets/SettingsSheet.tsx"));

  it("S1/S3: Salvar chama handleSaveName, que grava draftName e volta; o campo edita draftName", () => {
    expect(settings).toMatch(
      /const handleSaveName = async \(\) => \{ await setName\(draftName\); dispatchNav\(\{ type: "back" \}\); \};/,
    );
    expect(settings).toMatch(/accessibilityLabel=\{t\("settings\.name\.save"\)\} onPress=\{handleSaveName\}/);
    expect(settings).toMatch(/<BottomSheetTextInput value=\{draftName\} onChangeText=\{setDraftName\}/);
  });

  it("S14: o ‹ Ajustes e a barra da folha ligam em handleBack, que despacha back", () => {
    expect(settings).toMatch(/const handleBack = useCallback\(\(\) => dispatchNav\(\{ type: "back" \}\), \[\]\);/);
    expect(settings).toMatch(/<SettingsNavContext\.Provider value=\{\{ page, onBack: handleBack \}\}>/);
    expect(settings).toMatch(/accessibilityLabel=\{t\("settings\.back\.a11y"\)\} onPress=\{handleBack\}/);
    expect(settings).toMatch(/onPress=\{handleInfo\.press === "close" \? onClose : onBack\}/);
  });

  it("S9: o interruptor de feriados municipais mostra e grava includeMunicipalHolidays sem inverter", () => {
    expect(settings).toMatch(
      /<Switch accessibilityLabel=\{t\("settings\.holiday\.municipal"\)\} value=\{prefs\.includeMunicipalHolidays\} onValueChange=\{\(val\) => void prefs\.setIncludeMunicipalHolidays\(val\)\}/,
    );
    expect(settings).toMatch(/includeMunicipal: prefs\.includeMunicipalHolidays,/);
  });

  it("S10/S11: Exportar chama backup.exportNow; Importar abre backupImport só se escolheu arquivo", () => {
    expect(settings).toMatch(
      /accessibilityLabel=\{t\("settings\.export_backup\.a11y", \{ last: backupDays\.text \}\)\} onPress=\{backup\.exportNow\}/,
    );
    expect(settings).toMatch(
      /onPress=\{\(\) => void backup\.startImport\(\)\.then\(\(picked\) => \{ if \(picked\) dispatch\(\{ type: "push", sheet: \{ kind: "backupImport" \} \}\); \}\) ?\}/,
    );
  });

  it("S13: o contador exige 7 toques (padrão, sem argumento) e só o toque que dispara abre o relógio", () => {
    expect(settings).toMatch(/const counter = useRef\(createTapCounter\(\)\)\.current;/);
    expect(settings).toMatch(
      /onPress=\{\(\) => counter\.tap\(realNow\(\)\) && dispatch\(\{ type: "push", sheet: \{ kind: "clockPicker" \} \}\) ?\}/,
    );
  });

  it("S13: createTapCounter() sem argumento: 1 toque não dispara, o 7º dispara", () => {
    const counter = createTapCounter();
    const results = Array.from({ length: 7 }, (_, i) => counter.tap(1000 + i * 100));
    expect(results.slice(0, 6)).toEqual([false, false, false, false, false, false]);
    expect(results[6]).toBe(true);
  });

  it("S15: o campo nasce e volta ao nome salvo ao mudar o nome ou a página", () => {
    expect(settings).toMatch(/const \[draftName, setDraftName\] = useState\(currentUserName \?\? ""\);/);
    expect(settings).toMatch(
      /useEffect\(\(\) => \{ setDraftName\(currentUserName \?\? ""\); \}, \[currentUserName, page\]\);/,
    );
  });
});

describe("E-09 bloco 1b: HomeSheet (guia do Início)", () => {
  const home = squash(read("sheets/HomeSheet.tsx"));

  it("H9/H10/H11: homeGuide recebe dispensado, registros e pontos dos campos certos", () => {
    expect(home).toMatch(
      /return homeGuide\(\{ hasDataset: guideFacts\.hasDataset, stopCount: stops\.stops\.length, lineCount, recordCount: observations\.length, dismissed: guideDismissed, \}\);/,
    );
    expect(home).toMatch(/const lineCount = schedule\.status === "ready" \? schedule\.data\.lineInfo\.size : 0;/);
  });

  it("H9: dispensado vem de isHomeGuideDismissed(db) e vai para guideDismissed", () => {
    expect(home).toMatch(
      /Promise\.all\(\[readHomeGuideFacts\(db\), isHomeGuideDismissed\(db\)\]\) \.then\(\(\[facts, dismissed\]\) => \{ if \(active\) \{ setGuideFacts\(facts\); setGuideDismissed\(dismissed\);/,
    );
  });

  it("H3/H4: Ver os horários lembra o ponto e abre o ponto; sem ponto abre o Quadro", () => {
    expect(home).toMatch(
      /\} else if \(guideCard\.kind === "register"\) \{ if \(guideFacts\?\.lastLineFirstStop\) \{ recent\.remember\(guideFacts\.lastLineFirstStop\.id\); dispatch\(\{ type: "push", sheet: \{ kind: "stop", stopId: guideFacts\.lastLineFirstStop\.id, name: guideFacts\.lastLineFirstStop\.name, \}, \}\); \} else \{ dispatch\(\{ type: "push", sheet: \{ kind: "board", stopId: null \}, \}\); \}/,
    );
  });

  it("H5: Buscar meu ponto (mobilis) abre a Busca", () => {
    expect(home).toMatch(
      /\} else if \(guideCard\.kind === "mobilis"\) \{ dispatch\(\{ type: "push", sheet: \{ kind: "search" \} \}\); \}/,
    );
  });

  it("H6: o × esconde na hora (setGuideDismissed(true)) e grava a dispensa com a hora atual", () => {
    expect(home).toMatch(
      /onDismiss=\{\(\) => \{ setGuideDismissed\(true\); if \(db\) void dismissHomeGuide\(db, now\(\)\); \}\}/,
    );
  });
});

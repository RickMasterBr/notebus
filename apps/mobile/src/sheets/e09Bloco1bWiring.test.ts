/// <reference types="node" />
/**
 * Guardas de ligação do E-09 bloco 1b (só teste): cada regex confere o USO no ponto certo
 * (campo, argumento, prop no elemento certo, handler no elemento certo), não só a presença da chamada.
 * Ajustes (S1 a S15), Guia do Início (H3 a H11), Busca (SE5), Por que (A1 a A4, SH1, W1 a W4).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { searchEmpty } from "../data/emptyStates";
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
      /<NbSwitch accessibilityLabel=\{t\("settings\.holiday\.municipal"\)\} value=\{municipalSwitch\.value\} onValueChange=\{municipalSwitch\.onValueChange\}/,
    );
    expect(settings).toContain('useOptimisticSwitch(prefs.includeMunicipalHolidays, prefs.setIncludeMunicipalHolidays, "feriados", { deferCommitMs: SWITCH_ANIM_MS + 30, })');
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

describe("E-09 bloco 1b: SearchSheet (SE5)", () => {
  const search = squash(read("sheets/SearchSheet.tsx"));
  const noStopsBranch = search.match(/\} else if \(empty === "no_stops"\) \{ body = \( (<EmptyState[\s\S]*?\/>) \); \} else if/);

  it("SE5: o vazio sem pontos (sem termo) vem de empty === 'no_stops' e devolve ao fluxo pick", () => {
    expect(noStopsBranch, "ramo empty === 'no_stops' não encontrado").not.toBeNull();
    expect(noStopsBranch![1]).toMatch(
      /onPress: \(\) => dispatch\(\{ type: "push", sheet: \{ kind: "stopEdit", stopId: NEW_STOP_ID, afterSave: pick \? "pick" : "open", \}, \}\),/,
    );
    expect(noStopsBranch![1]).toMatch(/label: t\("stop_new\.title"\)/);
  });

  it("SE5: searchEmpty recebe pick, o termo e o total de pontos", () => {
    expect(search).toMatch(/const empty = searchEmpty\(\{ term, pick, stopTotal: index\.status === "ready" \? index\.stops\.length : null,/);
  });

  it("SE5: sem termo e sem pontos o vazio é no_stops, com ou sem pick", () => {
    for (const pick of [false, true]) {
      expect(searchEmpty({ term: "", pick, stopTotal: 0, recentCount: 0, showNoResults: false })).toBe("no_stops");
    }
  });

  it("SE5: o vazio com termo também devolve ao fluxo pick (e leva o nome)", () => {
    expect(search).toMatch(
      /kind: "stopEdit", stopId: NEW_STOP_ID, initialName: term\.trim\(\), afterSave: pick \? "pick" : "open",/,
    );
  });
});

describe("E-09 bloco 1b: Por que (AheadSheet, SheetHost, StopSheet, WhySheet)", () => {
  const ahead = squash(read("sheets/AheadSheet.tsx"));
  const host = squash(read("sheets/SheetHost.tsx"));
  const stop = squash(read("sheets/StopSheet.tsx"));
  const why = squash(read("sheets/WhySheet.tsx"));

  it("A0: o Ponto empilha o Adiante com a viagem, a posição, a data da linha e o tipo de dia do chip", () => {
    expect(stop).toMatch(/const serviceDate = row\.key\.split\("\/"\)\[0\]!;/);
    expect(stop).toMatch(/const currentDayType = day\?\.dayType \?\? dayType \?\? "weekday";/);
    expect(stop).toMatch(
      /kind: "ahead", tripId: row\.tripId, position: row\.position, serviceDate, dayType: currentDayType, \}, \}\);/,
    );
  });

  it("A1: o Adiante aprende no dia recebido (serviceDay: { date: serviceDate, dayType })", () => {
    expect(ahead).toMatch(
      /serviceDate && dayType \? buildAhead\(tripId, position, schedule\.data, \{ learning: \{ records: registro\.records, now: instant, serviceDay: \{ date: serviceDate, dayType \}, \}, \}\)/,
    );
  });

  it("A2: o dia usado é o recebido; sem ele, o do horário", () => {
    expect(ahead).toMatch(
      /if \(serviceDate && dayType\) return \{ date: serviceDate, dayType \}; if \(schedule\.status === "ready"\) return aheadServiceDay\(schedule\.data, tripId, instant\);/,
    );
  });

  it("A4: a entrada do Por que empilha viagem, posição, data e tipo de dia do dia usado", () => {
    expect(ahead).toMatch(
      /sheet: \{ kind: "why", tripId, position, serviceDate: usedDay\.date, dayType: usedDay\.dayType, \}, \}\);/,
    );
  });

  it("SH1: o SheetHost repassa viagem, posição, data e tipo de dia, campo a campo, ao Adiante e ao Por que", () => {
    for (const [kind, component] of [
      ["ahead", "AheadSheet"],
      ["why", "WhySheet"],
    ] as const) {
      expect(host).toMatch(
        new RegExp(
          `case "${kind}": return \\( <${component} id=\\{entry\\.id\\} tripId=\\{entry\\.tripId\\} position=\\{entry\\.position\\} serviceDate=\\{entry\\.serviceDate\\} dayType=\\{entry\\.dayType\\} />`,
        ),
      );
    }
  });

  it("W1: o Por que recalcula com os dados, os registros, a hora e o dia recebidos", () => {
    expect(why).toMatch(
      /return buildWhy\(\{ tripId, position, data: schedule\.data, records: registro\.records, now: instant, serviceDay: \{ date: serviceDate, dayType \}, \}\);/,
    );
    expect(why).toMatch(/\}, \[schedule, registro, instant, tripId, position, serviceDate, dayType\]\);/);
    expect(why).toMatch(/const instant = useNowTick\(\);/);
  });

  it("W2: a linha Última só aparece com why.last, é a última da lista e as Anotações deixam de ser a última", () => {
    expect(why).toMatch(/<WhyCountRow count=\{why\.count\} isLast=\{why\.last === null\} \/>/);
    expect(why).toMatch(/\{why\.last \? <WhySimpleRow row=\{why\.last\} isLast=\{true\} \/> : null\}/);
  });

  it("W3/W4: o contexto e o rodapé mostram why.context e why.footnote", () => {
    expect(why).toMatch(/<Text style=\{\[type\.caption, styles\.context, \{ color: colors\.textSecondary \}\]\}> \{why\.context\} <\/Text>/);
    expect(why).toMatch(/<Text style=\{\[type\.caption, styles\.footnote, \{ color: colors\.textSecondary \}\]\}> \{why\.footnote\} <\/Text>/);
  });

  it("W2: a folha com Última é mais alta (64%) que sem (54%)", () => {
    expect(why).toMatch(/snapPoints: \[why\?\.last \? "64%" : "54%"\],/);
    expect(why).toMatch(/\[why\?\.last\],/);
  });
});

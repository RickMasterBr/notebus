/// <reference types="node" />
/**
 * Guardas de ligação do E-08 bloco 12 (Item 5):
 * Protege o grupo "Linhas" da Busca e o perfil da linha no detalhe.
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

const searchSheet = squash(read("sheets/SearchSheet.tsx"));
const lineDetailSheet = squash(read("sheets/LineDetailSheet.tsx"));

describe("bloco12Wiring: SearchSheet.tsx (grupo Linhas)", () => {
  it("searchLines(lines, term) vai para lineResults", () => {
    expect(searchSheet).toContain("const lineResults = useMemo(() => searchLines(lines, term), [lines, term]);");
  });

  it("searchView recebe termo, recentes, pick, contagens e linesReady", () => {
    expect(searchSheet).toContain(
      "const view = searchView({ term, recentCount: recents.length, pick, stopCount: results.length, lineCount: lineResults.length, linesReady, });",
    );
  });

  it("o JSX usa view.showStops, view.showLines e view.showNoResults && index.status === 'ready'", () => {
    expect(searchSheet).toContain('{view.showStops ? group(t("search.group.stops"), results) : null}');
    expect(searchSheet).toContain('{view.showLines ? lineGroup(t("search.group.lines"), lineResults) : null}');
    expect(searchSheet).toContain('else if (view.showNoResults && index.status === "ready")');
  });

  it("a linha de resultado tem selo, nome, rótulo e abre o detalhe da linha", () => {
    expect(searchSheet).toContain("leading={<LineBadge code={line.code} color={line.color} />}");
    expect(searchSheet).toContain("title={line.name}");
    expect(searchSheet).toContain(
      'accessibilityLabel={t("search.result.line.a11y", { code: line.code, name: line.name })}',
    );
    expect(searchSheet).toContain(
      'onPress={() => dispatch({ type: "push", sheet: { kind: "lineDetail", lineId: line.id } })}',
    );
  });

  it("listLines(db) guarda o resultado em setLines e o cleanup desliga active", () => {
    expect(searchSheet).toContain("listLines(db) .then((rows) => { if (active) setLines(rows); })");
    expect(searchSheet).toContain("return () => { active = false; };");
  });
});

describe("bloco12Wiring: LineDetailSheet.tsx (perfil da linha)", () => {
  it("lineProfile recebe patterns, snapshot, selectedDayType e todayLisbon, e o useMemo depende dos quatro", () => {
    expect(lineDetailSheet).toContain(
      "const profile = useMemo( () => lineProfile({ patterns, snapshot, dayType: selectedDayType, todayLisbon }), [patterns, snapshot, selectedDayType, todayLisbon], );",
    );
  });

  it("lineProfileText(profile) é renderizado", () => {
    expect(lineDetailSheet).toContain("{lineProfileText(profile)}");
  });
});

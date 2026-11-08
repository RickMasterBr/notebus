/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ptBR } from "../i18n/pt-BR";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");
const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");

describe("recordsScreenWiring", () => {
  it("o SheetHost tem os três case com os componentes novos e não desenha mais RecordsSheet", () => {
    const host = read("sheets/SheetHost.tsx");
    expect(host).toContain('case "records": return <RecordsScreen id={entry.id} />;');
    expect(host).toContain(
      'case "recordTrip": return <RecordTripScreen id={entry.id} boardingId={entry.boardingId} />;',
    );
    expect(host).toContain('case "pendingAll": return <PendingAllScreen id={entry.id} />;');
    expect(host).not.toContain("<RecordsSheet");
  });

  it("RecordsScreen.tsx chama buildRecordsScreen e recordsScreenRows, usa BottomSheetFlatList e ScreenTopBar, empilha recordTrip e pendingAll", () => {
    const screen = read("sheets/RecordsScreen.tsx");
    expect(screen).toContain("buildRecordsScreen(");
    expect(screen).toContain("recordsScreenRows(");
    expect(screen).toContain("<BottomSheetFlatList");
    expect(screen).toContain("<ScreenTopBar");
    expect(screen).toContain('kind: "recordTrip"');
    expect(screen).toContain('kind: "pendingAll"');
  });

  it("RecordTripScreen.tsx chama alightRecordTime, alightLater e dismissNoAlight e usa RouteStopRow", () => {
    const tripScreen = read("sheets/RecordTripScreen.tsx");
    expect(tripScreen).toContain("alightRecordTime(");
    expect(tripScreen).toContain("alightLater(");
    expect(tripScreen).toContain("dismissNoAlight(");
    expect(tripScreen).toContain("<RouteStopRow");
  });

  it("Home.tsx tem <RecordsButton />", () => {
    const home = read("screens/Home.tsx");
    expect(home).toContain("<RecordsButton />");
  });

  it("SettingsButton.tsx e RecordsButton.tsx usam MapButton", () => {
    const settings = read("screens/SettingsButton.tsx");
    const recordsBtn = read("screens/RecordsButton.tsx");
    expect(settings).toContain("<MapButton");
    expect(recordsBtn).toContain("<MapButton");
  });

  it("as 13 chaves do item 8 existem no catálogo", () => {
    const requiredKeys = [
      "records.filter.all",
      "records.this_week",
      "records.older_weeks",
      "records.pending.see_all",
      "records.week.summary",
      "records.week.summary.a11y",
      "records.week.pending",
      "records.no_alight.ask",
      "records.no_alight.body",
      "records.no_alight.unknown",
      "toast.alight_later.title",
      "toast.alight_later.body",
      "home.records_button.pending.a11y",
    ] as const;

    for (const key of requiredKeys) {
      expect(key in ptBR, `chave ${key} deve existir no catálogo ptBR`).toBe(true);
    }
  });
});

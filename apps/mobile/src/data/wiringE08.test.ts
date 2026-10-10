/// <reference types="node" />
// E-08 (item 5.5 e item 4): guardas estáticos das ligações em componentes React, que o Node dos testes não monta.
// Conferem o USO (o argumento exato, a prop no elemento certo), não só que o texto existe (AGENTS.md).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8").replace(/\r\n/g, "\n");
const scheduleProvider = read("src/data/ScheduleProvider.tsx");
const calendarProvider = read("src/data/CalendarEditsProvider.tsx");
const preferencesProvider = read("src/data/PreferencesProvider.tsx");
const app = read("App.tsx");

describe("ScheduleProvider: a recarga (E-08)", () => {
  it("o reload relê os horários e troca o estado, e o contexto da recarga recebe esse reload", () => {
    expect(scheduleProvider).toMatch(/const reload = useCallback<ScheduleReload>\(async \(\) => \{\n\s+try \{\n\s+const data = await loadSchedule\(db\);\n\s+if \(alive\.current\) setState\(\{ status: "ready", data \}\);\n\s+return data;/);
    expect(scheduleProvider).toMatch(/<ReloadContext\.Provider value=\{reload\}>\s*<ScheduleContext\.Provider value=\{value\}>/);
    expect(scheduleProvider).toMatch(/export function useScheduleReload\(\): ScheduleReload \{\n\s+return useContext\(ReloadContext\);/);
  });

  it("useSchedule() continua devolvendo só o estado (o que as telas já usam)", () => {
    expect(scheduleProvider).toMatch(/export function useSchedule\(\): ScheduleState \{\n\s+return useContext\(ScheduleContext\);/);
  });
});

describe("CalendarEditsProvider: as ligações do item 5", () => {
  it("passa a recarga, o recasamento com a rede recarregada e o reagendamento ao módulo de dados", () => {
    expect(calendarProvider).toMatch(/createCalendarEdits<ScheduleSnapshot>\(\{\n\s+db,\n\s+exclusive,/);
    expect(calendarProvider).toMatch(/\n\s+reload,\n/);
    expect(calendarProvider).toMatch(/rematch: \(changed, fresh, nowMs\) => rematchWhere\(changed, matchNetworkOf\(fresh\), nowMs\),/);
    expect(calendarProvider).toMatch(/reschedule: async \(\) => requestReschedule\(\),/);
    expect(calendarProvider).toMatch(/const reload = useScheduleReload\(\);/);
  });
});

describe("PreferencesProvider: as ligações da margem", () => {
  it("passa a recarga e o reagendamento ao módulo de dados", () => {
    expect(preferencesProvider).toMatch(/createPreferences\(\{\n\s+db,\n\s+exclusive,\n\s+reload,\n/);
    expect(preferencesProvider).toMatch(/reschedule: async \(\) => requestReschedule\(\),/);
    expect(preferencesProvider).toMatch(/const reload = useScheduleReload\(\);/);
  });
});

describe("App.tsx: os providers na árvore", () => {
  it("PreferencesProvider e CalendarEditsProvider ficam dentro do RegistroProvider (precisam da fila) e do ScheduleProvider", () => {
    const at = (needle: string) => {
      const i = app.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      at("<ScheduleProvider db={db}>"),
      at("<RegistroProvider db={db}>"),
      at("<PreferencesProvider db={db}>"),
      at("<CalendarEditsProvider db={db}>"),
      at("<BackupProvider "),
      at("</CalendarEditsProvider>"),
      at("</PreferencesProvider>"),
      at("</RegistroProvider>"),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

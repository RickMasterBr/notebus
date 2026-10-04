import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { createTestClock } from "./src/data/clock";
import { TestClockProvider } from "./src/data/TestClockProvider";
import { RecentStopsProvider } from "./src/data/RecentStopsProvider";
import { ScheduleProvider } from "./src/data/ScheduleProvider";
import { StopIndexProvider } from "./src/data/StopIndexProvider";
import { markFirstRunDone, needsFirstRun } from "./src/db/appState";
import { pickAndImport } from "./src/db/importFromFile";
import { expoImportDb, openNotebusDb } from "./src/db/open";
import { FirstRun } from "./src/screens/FirstRun";
import { Home } from "./src/screens/Home";
import { MigrationNotice } from "./src/ui/MigrationNotice";
import { TestClockBanner } from "./src/ui/TestClockBanner";

// Relógio de teste (D-095): desligado = relógio real. Faixa, seletor e Ajustes: D-151.
const testClock = createTestClock();

type Db = Awaited<ReturnType<typeof openNotebusDb>>["db"];
type Phase = "loading" | "first_run" | "list" | "read_only_empty";

export default function App() {
  const [db, setDb] = useState<Db | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [migrationFailed, setMigrationFailed] = useState(false);

  useEffect(() => {
    openNotebusDb().then(async ({ db: opened, migration }) => {
      setDb(opened);
      if (migration.status === "failed") {
        setMigrationFailed(true);
        // Instalação nova (versão 0): o banco voltou vazio, sem tabelas para ler. Só o aviso.
        if (migration.error.fromVersion === 0) return setPhase("read_only_empty");
      }
      setPhase((await needsFirstRun(opened)) ? "first_run" : "list");
    });
  }, []);

  if (!db || phase === "loading") return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {migrationFailed ? <MigrationNotice /> : null}
        {phase === "read_only_empty" ? null : phase === "first_run" ? (
          <FirstRun
            onImport={async (onCount) => {
              const result = await pickAndImport(expoImportDb(db.$client), onCount);
              if (result.status === "done") {
                await markFirstRunDone(db);
                setPhase("list");
              }
              return result.status;
            }}
            onStartEmpty={async () => {
              await markFirstRunDone(db);
              setPhase("list");
            }}
          />
        ) : (
          <TestClockProvider clock={testClock}>
            <StopIndexProvider db={db}>
              <ScheduleProvider db={db}>
                <RecentStopsProvider db={db}>
                  <Home />
                </RecentStopsProvider>
              </ScheduleProvider>
            </StopIndexProvider>
            <TestClockBanner />
          </TestClockProvider>
        )}
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createTestClock } from "./src/data/clock";
import { TestClockProvider } from "./src/data/TestClockProvider";
import { RecentStopsProvider } from "./src/data/RecentStopsProvider";
import { PlacesProvider } from "./src/data/PlacesProvider";
import { CalendarEditsProvider } from "./src/data/CalendarEditsProvider";
import { PreferencesProvider } from "./src/data/PreferencesProvider";
import { RegistroProvider } from "./src/data/RegistroProvider";
import { ScheduleProvider } from "./src/data/ScheduleProvider";
import { StopIndexProvider } from "./src/data/StopIndexProvider";
import { PositionProvider } from "./src/data/PositionProvider";
import { StopLocationsProvider } from "./src/data/StopLocationsProvider";
import { ToastProvider } from "./src/data/ToastProvider";
import { BackupProvider } from "./src/data/BackupProvider";
import { OfflineMapProvider } from "./src/data/OfflineMapProvider";
import { markFirstRunDone, needsFirstRun } from "./src/db/appState";
import { pickAndImport } from "./src/db/importFromFile";
import { expoBackupStore, expoImportDb, openNotebusDb } from "./src/db/open";
import { setSharedDb } from "./src/db/sharedDb";
import { useAlarmLifecycle } from "./src/notifications/useAlarmLifecycle";
import appJson from "./app.json";
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
      setSharedDb(opened); // o tratador dos botões do aviso usa este banco (E-06 §4.2)
      setDb(opened);
      if (migration.status === "failed") {
        setMigrationFailed(true);
        // Instalação nova (versão 0): o banco voltou vazio, sem tabelas para ler. Só o aviso.
        if (migration.error.fromVersion === 0) return setPhase("read_only_empty");
      }
      setPhase((await needsFirstRun(opened)) ? "first_run" : "list");
    });
  }, []);

  // Identidade fixa: o backup lê e grava pelo SQL cru do mesmo banco (E-03 §5).
  const raw = useMemo(() => (db ? expoImportDb(db.$client) : null), [db]);
  const backups = useCallback(() => expoBackupStore(db!.$client), [db]);

  useAlarmLifecycle(db, phase === "list");

  if (!db || !raw || phase === "loading") return null;

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
            <ToastProvider>
              <StopIndexProvider db={db}>
                <ScheduleProvider db={db}>
                  <RecentStopsProvider db={db}>
                    <PositionProvider>
                      <StopLocationsProvider db={db}>
                        <RegistroProvider db={db}>
                          <PreferencesProvider db={db}>
                            <CalendarEditsProvider db={db}>
                              <PlacesProvider db={db}>
                                <BackupProvider raw={raw} backups={backups} appVersion={appJson.expo.version}>
                                  <OfflineMapProvider db={db}>
                                    <Home />
                                  </OfflineMapProvider>
                                </BackupProvider>
                              </PlacesProvider>
                            </CalendarEditsProvider>
                          </PreferencesProvider>
                        </RegistroProvider>
                      </StopLocationsProvider>
                    </PositionProvider>
                  </RecentStopsProvider>
                </ScheduleProvider>
              </StopIndexProvider>
            </ToastProvider>
            <TestClockBanner />
          </TestClockProvider>
        )}
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

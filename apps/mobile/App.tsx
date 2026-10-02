import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { markFirstRunDone, needsFirstRun } from "./src/db/appState";
import { pickAndImport } from "./src/db/importFromFile";
import { expoImportDb, openNotebusDb } from "./src/db/open";
import { FirstRun } from "./src/screens/FirstRun";
import { ProvisionalList } from "./src/screens/ProvisionalList";

type Db = Awaited<ReturnType<typeof openNotebusDb>>["db"];
type Phase = "loading" | "first_run" | "list";

export default function App() {
  const [db, setDb] = useState<Db | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    openNotebusDb().then(async ({ db: opened }) => {
      setDb(opened);
      setPhase((await needsFirstRun(opened)) ? "first_run" : "list");
    });
  }, []);

  if (!db || phase === "loading") return null;

  return (
    <>
      {phase === "first_run" ? (
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
        <ProvisionalList db={db} />
      )}
      <StatusBar style="auto" />
    </>
  );
}

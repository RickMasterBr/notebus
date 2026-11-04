/**
 * Rede nova num app em uso (ideia 249): o núcleo não sabe de onde o arquivo veio (seletor hoje; dataset embutido ou
 * baixado na v2). Preparar não grava; aplicar tira uma cópia do banco antes, chama `importMobilis` (que só acrescenta,
 * D-122/D-123) e, se falhar, devolve a cópia. Desfazer devolve a cópia (o que foi gravado depois dela também volta).
 * Sem `expo-*` nem React: roda no Node.
 */
import { parseSeedFile } from "@notebus/domain";
import { type ImportDb, importMobilis } from "./importMobilis";
import { type BackupStore, pruneBackups } from "./migrate";

export type NetworkPreview =
  | {
      ok: true;
      /** Vigência (`valid_from`) do primeiro quadro do arquivo. */
      vigencia: string;
      lines: number;
      stops: number;
      trips: number;
      /** Todos os quadros do arquivo já estão no banco: importar não muda nada. */
      jaInstalada: boolean;
    }
  | { ok: false; reason: "invalid"; detail: string };

/** Valida o arquivo e resume; não grava nada. Backup do NoteBus não passa em `parseSeedFile`. */
export async function prepareNetworkImport(db: ImportDb, json: unknown): Promise<NetworkPreview> {
  let seed;
  try {
    seed = parseSeedFile(json);
  } catch (error) {
    return { ok: false, reason: "invalid", detail: error instanceof Error ? error.message : String(error) };
  }
  const known = new Set((await db.all("SELECT id FROM timetable", [])).map((r) => r.id as string));
  return {
    ok: true,
    vigencia: seed.timetables[0]?.validFrom ?? "",
    lines: seed.lines.length,
    stops: seed.stops.length,
    trips: seed.trips.length,
    jaInstalada: seed.timetables.length > 0 && seed.timetables.every((t) => known.has(t.id)),
  };
}

export type NetworkApplyResult = { ok: true; copyName: string } | { ok: false; error: unknown };

/** Cópia, importação e, na falha, restauração da cópia. `now` vem de fora (relógio do app). */
export async function applyNetworkImport(
  db: ImportDb,
  json: unknown,
  opts: { backups: BackupStore; now: number },
): Promise<NetworkApplyResult> {
  const copyName = `notebus-backup-${new Date(opts.now).toISOString().replace(/[:.]/g, "-")}-import.db`;
  try {
    await opts.backups.create(copyName);
    await pruneBackups(opts.backups);
    await importMobilis(db, json, { now: () => opts.now });
    return { ok: true, copyName };
  } catch (error) {
    // importMobilis já deu ROLLBACK; a cópia cobre qualquer coisa além da transação.
    await opts.backups.restore(copyName).catch(() => {});
    return { ok: false, error };
  }
}

export async function undoNetworkImport(backups: BackupStore, copyName: string): Promise<void> {
  await backups.restore(copyName);
}

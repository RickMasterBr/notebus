/**
 * Os dois fluxos do backup (E-03 §5.3 e §5.4) sem React e sem `expo-*`: o arquivo, a conferência e o compartilhar
 * entram por parâmetro (`backupNative.ts` no celular, funções falsas nos testes).
 *
 * Exportar: monta o arquivo → grava → **relê o arquivo gravado** e confere checksum e contagens com a mesma validação
 * da importação → só então abre a folha de compartilhar → só depois que ela abriu sem erro grava `last_export_at`.
 * Importar: lê → valida inteiro (`parseBackup`) → prévia (data, registros, lugares, MOBILIS, órfãos). Gravar é com
 * `importBackup` (banco), depois de o Rick confirmar.
 */
import {
  type BackupFile,
  type BackupProblem,
  type MergeSummary,
  type Orphan,
  type Sha256,
  backupFileName,
  backupSummary,
  countTables,
  lisbonWallClock,
  parseBackup,
  serializeBackup,
} from "@notebus/domain";
import { LAST_EXPORT_AT, installedDatasets, orphansOf, previewMerge, readBackupInput, writeSettingNumber } from "../db/backup";
import type { ImportDb } from "../db/importMobilis";

export interface ExportIO {
  /** Grava o texto num arquivo temporário e devolve o endereço dele. */
  write(name: string, text: string): Promise<string>;
  /** Lê de volta o que ficou gravado. */
  read(uri: string): Promise<string>;
  /** Abre a folha de compartilhar do sistema. Lança se não abrir. */
  share(uri: string): Promise<void>;
}

export type ExportResult =
  | { ok: true; fileName: string; counts: Record<string, number>; bytes: number }
  /** Não entregue: a gravação, a releitura ou a folha de compartilhar falharam. `last_export_at` não mudou. */
  | { ok: false; stage: "write" | "verify" | "share"; detail: string };

export async function exportBackup(
  db: ImportDb,
  deps: { now: number; appVersion: string; sha256: Sha256; io: ExportIO; newId: () => string },
): Promise<ExportResult> {
  const { now, io } = deps;
  const input = await readBackupInput(db, { now, appVersion: deps.appVersion });
  const text = await serializeBackup(input, deps.sha256);
  const fileName = backupFileName(lisbonWallClock(now));
  let uri: string;
  let reread: string;
  try {
    uri = await io.write(fileName, text);
    reread = await io.read(uri);
  } catch (error) {
    return { ok: false, stage: "write", detail: String(error) };
  }
  const check = await parseBackup(reread, { sha256: deps.sha256, installedDatasets: input.datasets });
  if (!check.ok) return { ok: false, stage: "verify", detail: `${check.problem}: ${check.detail}` };
  const expected = countTables(JSON.parse(text).tables);
  const got = countTables(check.backup.tables);
  if (JSON.stringify(expected) !== JSON.stringify(got)) return { ok: false, stage: "verify", detail: "counts_mismatch" };
  try {
    await io.share(uri);
  } catch (error) {
    return { ok: false, stage: "share", detail: String(error) };
  }
  await writeSettingNumber(db, LAST_EXPORT_AT, now, now, deps.newId);
  return { ok: true, fileName, counts: got, bytes: byteLength(reread) };
}

/** Tamanho em bytes do texto em UTF-8 (sem `Buffer`, que não existe no celular). */
export function byteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export type ImportPreview =
  | {
      ok: true;
      file: BackupFile;
      /** "25/10/2026": dia do backup na hora de Lisboa. */
      date: string;
      records: number;
      places: number;
      /** Vigências das MOBILIS do arquivo ("2026-09-01"). */
      datasets: string[];
      orphans: Orphan[];
      merge: MergeSummary;
    }
  | { ok: false; problem: BackupProblem; detail: string; missing?: { name: string; version: string }[] };

/** Lê e valida um arquivo escolhido, sem gravar nada, e monta a prévia. */
export async function prepareImport(db: ImportDb, text: string, sha256: Sha256): Promise<ImportPreview> {
  const parsed = await parseBackup(text, { sha256, installedDatasets: await installedDatasets(db) });
  if (!parsed.ok) return parsed;
  const file = parsed.backup;
  const summary = backupSummary(file);
  const day = lisbonWallClock(Date.parse(file.exportedAt)).date;
  const [y, m, d] = day.split("-");
  return {
    ok: true,
    file,
    date: `${d}/${m}/${y}`,
    records: summary.records,
    places: summary.places,
    datasets: summary.datasets,
    orphans: await orphansOf(db, file),
    merge: await previewMerge(db, file),
  };
}

/**
 * Seletor de arquivo → JSON da MOBILIS → `importMobilis` (D-091: o arquivo vem de fora, nunca do repositório).
 * Só provado no iPhone (expo-document-picker não roda no Node).
 */
import * as DocumentPicker from "expo-document-picker";
import { parseSeedFile } from "@notebus/domain";
import { type ImportDb, importMobilis } from "./importMobilis";

export type PickResult =
  | { status: "cancelled" }
  | { status: "done" }
  /** O arquivo não é um JSON no formato da MOBILIS (nada foi gravado). */
  | { status: "invalid"; error: unknown }
  /** O arquivo é válido, mas a gravação falhou (a transação foi desfeita). */
  | { status: "failed"; error: unknown };

/** `onCount` avisa quantas linhas o arquivo tem, assim que ele é lido e validado (antes de gravar). */
export async function pickAndImport(db: ImportDb, onCount: (lines: number) => void): Promise<PickResult> {
  const picked = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
  const asset = picked.assets?.[0];
  if (picked.canceled || !asset) return { status: "cancelled" };
  let json: unknown;
  try {
    json = await (await fetch(asset.uri)).json();
    onCount(parseSeedFile(json).lines.length);
  } catch (error) {
    return { status: "invalid", error };
  }
  try {
    await importMobilis(db, json);
    return { status: "done" };
  } catch (error) {
    return { status: "failed", error };
  }
}

/** Funcionalidades para selecionar um arquivo e iniciar a importação de dados para o banco. */
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

/**
 * Abre o seletor nativo de documentos (iOS/Android), lê o arquivo JSON
 * e faz o parse antes de chamar o importador.
 *
 * @param db - Interface do banco (geralmente ExpoImportDb)
 * @param onCount - Callback acionado assim que o arquivo é lido e validado,
 *                  passando o número de linhas (`lines`) do dataset.
 *                  Útil para feedback imediato antes da transação longa de gravação.
 * @returns Status da operação e, se falhou, o erro em anexo.
 */
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

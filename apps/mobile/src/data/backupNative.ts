/**
 * A parte nativa do backup (E-03 §5.3, §5.4): arquivo temporário (`expo-file-system`), folha de compartilhar
 * (`expo-sharing`), SHA-256 (`expo-crypto`) e o seletor de documento (`expo-document-picker`, só `.json`).
 * Fino de propósito: a lógica está em `backupFlow.ts` e no domínio, testados no Node. Só se prova no iPhone.
 */
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";
import { t } from "../i18n";
import type { ExportIO } from "./backupFlow";

/** SHA-256 em 64 hex minúsculos, do texto em UTF-8. */
export async function nativeSha256(text: string): Promise<string> {
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, { encoding: Crypto.CryptoEncoding.HEX });
  return hex.toLowerCase();
}

export const nativeExportIO: ExportIO = {
  async write(name, text) {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    return file.uri;
  },
  read: (uri) => new File(uri).text(),
  // Lança se a folha não abre. iOS: `Share.share` diz se usou ou fechou. Android: o expo-sharing não diz, então `unknown`.
  async share(uri) {
    if (Platform.OS === "ios") {
      const r = await Share.share({ url: uri });
      return r.action === Share.dismissedAction ? "dismissed" : "used";
    }
    await Sharing.shareAsync(uri, { mimeType: "application/json", UTI: "public.json", dialogTitle: t("backup.share_title") });
    return "unknown";
  },
};

/** Abre o seletor de documento (só JSON) e devolve o texto do arquivo, ou `null` se cancelou. */
export async function pickBackupText(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
  const asset = picked.assets?.[0];
  if (picked.canceled || !asset) return null;
  return new File(asset.uri).text();
}

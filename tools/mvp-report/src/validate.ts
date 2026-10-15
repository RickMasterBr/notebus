/** Validação de integridade e versão do backup para o mvp-report. */
import { createHash } from "node:crypto";
import {
  BACKUP_FORMAT,
  checksumMatches,
  migrateBackup,
  type BackupFile,
  type BackupParseResult,
} from "@notebus/domain/src/backup.ts";

export const sha256Node = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");

export interface ValidationSuccess {
  ok: true;
  backup: BackupFile;
}

export interface ValidationFailure {
  ok: false;
  error: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Lê o texto do arquivo e valida o formato, o checksum SHA-256 e a formatVersion.
 * Se o checksum falhar ou a versão for desconhecida, recusa com erro descritivo.
 */
export async function validateBackupText(text: string): Promise<ValidationResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Arquivo corrompido: não é um JSON válido." };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Arquivo inválido: formato desconhecido." };
  }

  const obj = raw as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) {
    return { ok: false, error: `Arquivo inválido: campo 'format' deve ser '${BACKUP_FORMAT}'.` };
  }

  if (typeof obj.checksum !== "string") {
    return { ok: false, error: "Arquivo inválido: checksum ausente." };
  }

  const checksumOk = await checksumMatches(text, obj.checksum, sha256Node);
  if (!checksumOk) {
    return { ok: false, error: "Checksum não confere: o arquivo foi alterado ou está corrompido." };
  }

  const migrated: BackupParseResult = migrateBackup(obj);
  if (!migrated.ok) {
    return { ok: false, error: `Versão do backup não suportada: ${migrated.detail}` };
  }

  return { ok: true, backup: migrated.backup };
}

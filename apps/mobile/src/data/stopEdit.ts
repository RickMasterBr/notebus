/**
 * Regras puras do formulário de edição de ponto (E-08 §5.1, D-113, Item 1).
 * Puro: sem React e sem banco.
 */
import { normalizeSearch } from "@notebus/domain";

export const MAX_NAME_LENGTH = 80;
export const MAX_NOTE_LENGTH = 200;
export const MAX_ALIASES = 10;
export const MAX_ALIAS_LENGTH = 60;
export const MAX_EXTERNAL_ID_LENGTH = 20;

/** `stopId` da folha Editar ponto quando o ponto ainda não existe (E-08 bloco 7). */
export const NEW_STOP_ID = "__new__";

/** Limite de digitação de cada campo de Editar ponto (E-08 bloco 6, E2). A validação continua para texto colado e dados antigos. */
export const FIELD_LIMITS = {
  name: MAX_NAME_LENGTH,
  alias: MAX_ALIAS_LENGTH,
  externalId: MAX_EXTERNAL_ID_LENGTH,
  note: MAX_NOTE_LENGTH,
} as const;

export type AliasRefusal =
  | "empty"
  | "same_as_name"
  | "duplicate"
  | "too_many"
  | "too_long";

export type AddAliasResult =
  | { ok: true; aliases: string[] }
  | { ok: false; reason: AliasRefusal };

export function normalizeAlias(text: string): string | null {
  const collapsed = text.trim().replace(/\s+/g, " ");
  return collapsed.length > 0 ? collapsed : null;
}

export function addAlias(
  current: readonly string[],
  text: string,
  name: string,
): AddAliasResult {
  const normalized = normalizeAlias(text);
  if (!normalized) {
    return { ok: false, reason: "empty" };
  }
  if (normalized.length > MAX_ALIAS_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  if (current.length >= MAX_ALIASES) {
    return { ok: false, reason: "too_many" };
  }
  if (normalizeSearch(normalized) === normalizeSearch(name)) {
    return { ok: false, reason: "same_as_name" };
  }
  const needle = normalizeSearch(normalized);
  if (current.some((a) => normalizeSearch(a) === needle)) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true, aliases: [...current, normalized] };
}

export type CommitPendingAliasResult =
  | { ok: true; aliases: string[] }
  | { ok: false; reason: AliasRefusal };

/**
 * O que acontece com o texto que ficou no campo de apelido quando a pessoa toca em Salvar (D8, E-08 bloco 5).
 * Vazio: nada muda. Válido: entra na lista, com as regras do `addAlias`. Inválido: devolve o motivo e o Salvar não grava.
 */
export function commitPendingAlias(
  aliases: readonly string[],
  pendingText: string,
  name: string,
): CommitPendingAliasResult {
  if (normalizeAlias(pendingText) === null) {
    return { ok: true, aliases: [...aliases] };
  }
  return addAlias(aliases, pendingText, name);
}

/**
 * O ID externo passa de 20 caracteres? Só conta quando o ID mudou: um ponto cujo ID real já é mais longo
 * continua salvável sem tocar no campo (D9).
 */
export function externalIdTooLong(next: string | null, current: string | null): boolean {
  const nextTrimmed = next?.trim() || null;
  if (nextTrimmed === null) return false;
  if (nextTrimmed === (current?.trim() || null)) return false;
  return nextTrimmed.length > MAX_EXTERNAL_ID_LENGTH;
}

export interface StopEditOther {
  id: string;
  name: string;
  externalId: string | null;
}

export interface ValidateStopEditInput {
  name: string;
  externalId: string | null;
  note: string | null;
  aliases: readonly string[];
  others: readonly StopEditOther[];
  /** O ID externo que o ponto já tem (para o limite de 20 só valer quando o ID mudou). */
  originalExternalId?: string | null;
}

export interface StopEditNormalizedValue {
  name: string;
  externalId: string | null;
  note: string | null;
  aliases: string[];
}

export interface StopEditErrors {
  name?: "required" | "too_long";
  externalId?: { duplicateOf: string };
  externalIdTooLong?: true;
  note?: "too_long";
}

export type ValidateStopEditResult =
  | { ok: true; value: StopEditNormalizedValue }
  | { ok: false; errors: StopEditErrors };

export function validateStopEdit(
  input: ValidateStopEditInput,
): ValidateStopEditResult {
  const errors: StopEditErrors = {};

  const nameTrimmed = input.name.trim();
  if (nameTrimmed.length === 0) {
    errors.name = "required";
  } else if (nameTrimmed.length > MAX_NAME_LENGTH) {
    errors.name = "too_long";
  }

  const externalIdTrimmed = input.externalId?.trim() || null;
  if (externalIdTooLong(externalIdTrimmed, input.originalExternalId ?? null)) {
    errors.externalIdTooLong = true;
  }
  if (externalIdTrimmed !== null) {
    const needle = externalIdTrimmed.toLowerCase();
    const duplicate = input.others.find(
      (o) => o.externalId && o.externalId.trim().toLowerCase() === needle,
    );
    if (duplicate) {
      errors.externalId = { duplicateOf: duplicate.name };
    }
  }

  const noteTrimmed = input.note?.trim() || null;
  if (noteTrimmed !== null && noteTrimmed.length > MAX_NOTE_LENGTH) {
    errors.note = "too_long";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      name: nameTrimmed,
      externalId: externalIdTrimmed,
      note: noteTrimmed,
      aliases: [...input.aliases],
    },
  };
}

export interface StopEditDraft {
  name: string;
  externalId: string | null;
  note: string | null;
  aliases: readonly string[];
}

export interface StopEditViewInput {
  original: StopEditDraft;
  draft: StopEditDraft;
  validation: ValidateStopEditResult;
  aliasError?: AliasRefusal | null;
  /** Texto que está no campo de novo apelido e ainda não foi adicionado (D8). */
  pendingAlias?: string;
}

export interface StopEditView {
  canSave: boolean;
  nameError: "required" | "too_long" | null;
  externalIdError: { duplicateOf: string } | null;
  externalIdTooLong: boolean;
  noteError: "too_long" | null;
  aliasError: AliasRefusal | null;
  isChanged: boolean;
}

export function stopEditView(input: StopEditViewInput): StopEditView {
  const { original, draft, validation, aliasError, pendingAlias } = input;

  const origName = original.name.trim();
  const draftName = draft.name.trim();
  const origExt = original.externalId?.trim() || null;
  const draftExt = draft.externalId?.trim() || null;
  const origNote = original.note?.trim() || null;
  const draftNote = draft.note?.trim() || null;

  const aliasesChanged =
    original.aliases.length !== draft.aliases.length ||
    original.aliases.some((a, i) => a !== draft.aliases[i]);

  // Texto válido no campo de apelido conta como mudança: o Salvar o adiciona. Texto inválido não liga o Salvar sozinho.
  const pendingChange =
    normalizeAlias(pendingAlias ?? "") !== null &&
    commitPendingAlias(draft.aliases, pendingAlias ?? "", draft.name).ok;

  const isChanged =
    origName !== draftName ||
    origExt !== draftExt ||
    origNote !== draftNote ||
    aliasesChanged ||
    pendingChange;

  const nameError = !validation.ok ? validation.errors.name ?? null : null;
  const externalIdError =
    !validation.ok ? validation.errors.externalId ?? null : null;
  const externalIdTooLongError = !validation.ok && validation.errors.externalIdTooLong === true;
  const noteError = !validation.ok ? validation.errors.note ?? null : null;

  const canSave = isChanged && validation.ok;

  return {
    canSave,
    nameError,
    externalIdError,
    externalIdTooLong: externalIdTooLongError,
    noteError,
    aliasError: aliasError ?? null,
    isChanged,
  };
}

export type StopLocationKey =
  | "stop_edit.location.none"
  | "stop_edit.location.manual"
  | "stop_edit.location.suggested"
  | "stop_edit.location.official";

export function stopLocationStatusKey(
  lat: number | null,
  lon: number | null,
  locationSource: "manual" | "suggested" | null,
): StopLocationKey {
  if (lat === null || lon === null) {
    return "stop_edit.location.none";
  }
  if (locationSource === "manual") {
    return "stop_edit.location.manual";
  }
  if (locationSource === "suggested") {
    return "stop_edit.location.suggested";
  }
  return "stop_edit.location.official";
}


/**
 * Regras puras do formulário de edição de ponto (E-08 §5.1, D-113, Item 1).
 * Puro: sem React e sem banco.
 */
import { normalizeSearch } from "@notebus/domain";

export const MAX_NAME_LENGTH = 80;
export const MAX_NOTE_LENGTH = 200;
export const MAX_ALIASES = 10;
export const MAX_ALIAS_LENGTH = 60;

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
}

export interface StopEditView {
  canSave: boolean;
  nameError: "required" | "too_long" | null;
  externalIdError: { duplicateOf: string } | null;
  noteError: "too_long" | null;
  aliasError: AliasRefusal | null;
  isChanged: boolean;
}

export function stopEditView(input: StopEditViewInput): StopEditView {
  const { original, draft, validation, aliasError } = input;

  const origName = original.name.trim();
  const draftName = draft.name.trim();
  const origExt = original.externalId?.trim() || null;
  const draftExt = draft.externalId?.trim() || null;
  const origNote = original.note?.trim() || null;
  const draftNote = draft.note?.trim() || null;

  const aliasesChanged =
    original.aliases.length !== draft.aliases.length ||
    original.aliases.some((a, i) => a !== draft.aliases[i]);

  const isChanged =
    origName !== draftName ||
    origExt !== draftExt ||
    origNote !== draftNote ||
    aliasesChanged;

  const nameError = !validation.ok ? validation.errors.name ?? null : null;
  const externalIdError =
    !validation.ok ? validation.errors.externalId ?? null : null;
  const noteError = !validation.ok ? validation.errors.note ?? null : null;

  const canSave = isChanged && validation.ok;

  return {
    canSave,
    nameError,
    externalIdError,
    noteError,
    aliasError: aliasError ?? null,
    isChanged,
  };
}

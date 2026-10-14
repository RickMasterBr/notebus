/**
 * Regras puras de localização opcional no "Novo ponto" (E-08 §5.4, D-184, bloco 11b, Item 2).
 * Puro: sem React e sem banco.
 */
import type { NewStopValues } from "../db/stopCreate";
import type { StopPoint } from "../db/stopLocation";
import type { MessageKey } from "../i18n/pt-BR";
import { stopLocationStatusKey, type StopLocationKey } from "./stopEdit";

import { stopLocationView } from "./stopLocationEdit";

export interface NewStopDraftValues {
  name: string;
  externalId: string | null;
  note: string | null;
}

/** Monta os valores de criação de ponto para createStop. */
export function buildNewStopValues(
  draft: NewStopDraftValues,
  aliases: readonly string[],
  location: StopPoint | null,
): NewStopValues {
  return {
    name: draft.name,
    aliases: [...aliases],
    externalId: draft.externalId,
    note: draft.note,
    location,
  };
}

export interface NewStopLocationView {
  statusKey: StopLocationKey;
  openKey: MessageKey;
  canRemove: boolean;
}

/**
 * Visão da seção Localização no modo isNew:
 * sem localização -> stop_edit.location.none, canRemove: false
 * com localização -> stop_edit.location.manual, canRemove: true
 */
export function newStopLocationView(location: StopPoint | null): NewStopLocationView {
  const view = stopLocationView({ lat: null, lon: null, locationSource: null }, location);
  return {
    statusKey: view.statusKey,
    openKey: view.openKey,
    canRemove: view.canRemove,
  };
}

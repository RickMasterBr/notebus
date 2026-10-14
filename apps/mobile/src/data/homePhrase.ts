/**
 * Decisão pura para a frase viva do Início (E-08.5 Bloco 17, 4.9 C, D-207 item 6, ideia 50).
 * Função pura: sem relógio direto, sem expo-*, com o sorteio injetado por pick (0 <= pick < 1).
 */
import { t } from "../i18n";
import { greetingEyebrow, greetingPeriod } from "./greeting";

export interface PhraseDeparture {
  lineId: string;
  lineCode: string;
  stopName: string;
  placeId: string;
  beAtStopAt: number; // epoch ms, "esteja no ponto às"
  busAt: number;      // epoch ms, calculado no Item 2
}

export type InvitePhraseId = "where" | "line" | "faculty_or_home" | "first_bus" | "going_home" | "note_next";

export type HomePhraseId = "arriving_minutes" | "arriving_leave" | `invite_${InvitePhraseId}`;

export interface HomePhrase {
  id: HomePhraseId;
  eyebrow: string;                  // saudação sem ponto final, com ou sem nome
  headline: string;                 // a frase grande
  arriving: PhraseDeparture | null; // só nas duas frases de ônibus chegando
}

export interface HomePhraseInput {
  inTrip: boolean;
  now: number;
  hour: number;
  name: string | null;
  departures: readonly PhraseDeparture[];
  placeCount: number;
  hasHomePlace: boolean;
  recordCount: number;
  lastPhraseId: HomePhraseId | null;
  pick: number; // 0 <= pick < 1, injetado
}

const INVITE_ORDER: readonly InvitePhraseId[] = [
  "where",
  "line",
  "faculty_or_home",
  "first_bus",
  "going_home",
  "note_next",
] as const;

export function homePhrase(input: HomePhraseInput): HomePhrase | null {
  // 1. Em viagem: sem frase (o cartão "Em viagem" ocupa o lugar)
  if (input.inTrip) {
    return null;
  }

  const eyebrow = greetingEyebrow({ hour: input.hour, name: input.name });

  // 2. Ônibus chegando: entre as departures com busAt > now e busAt - now <= 30 * 60000,
  // escolha a de menor busAt.
  const eligibleDepartures = input.departures.filter(
    (d) => d.busAt > input.now && d.busAt - input.now <= 30 * 60_000,
  );

  if (eligibleDepartures.length > 0) {
    let chosen = eligibleDepartures[0]!;
    for (let i = 1; i < eligibleDepartures.length; i++) {
      if (eligibleDepartures[i]!.busAt < chosen.busAt) {
        chosen = eligibleDepartures[i]!;
      }
    }

    if (input.now >= chosen.beAtStopAt) {
      return {
        id: "arriving_leave",
        eyebrow,
        headline: t("home.greeting.arriving.leave"),
        arriving: chosen,
      };
    }

    const n = Math.max(1, Math.ceil((chosen.busAt - input.now) / 60_000));
    const headline =
      n === 1
        ? t("home.greeting.arriving.minutes_one")
        : t("home.greeting.arriving.minutes", { n });

    return {
      id: "arriving_minutes",
      eyebrow,
      headline,
      arriving: chosen,
    };
  }

  // 3. Convite: nenhum ônibus chegando
  const period = greetingPeriod(input.hour);
  const eligibleInvites: InvitePhraseId[] = [];

  for (const id of INVITE_ORDER) {
    if (id === "where" || id === "line") {
      eligibleInvites.push(id);
    } else if (id === "faculty_or_home" && input.placeCount >= 2) {
      eligibleInvites.push(id);
    } else if (id === "first_bus" && period === "morning") {
      eligibleInvites.push(id);
    } else if (id === "going_home" && period === "night" && input.hasHomePlace) {
      eligibleInvites.push(id);
    } else if (id === "note_next" && input.recordCount === 0) {
      eligibleInvites.push(id);
    }
  }

  // Tire da lista o convite cujo id é lastPhraseId se sobrar pelo menos um outro; se só sobrar esse, ele fica.
  let pool = eligibleInvites;
  if (input.lastPhraseId) {
    const filtered = eligibleInvites.filter((id) => `invite_${id}` !== input.lastPhraseId);
    if (filtered.length >= 1) {
      pool = filtered;
    }
  }

  const chosenInvite = selectInvite(pool, null, input.pick);

  return {
    id: `invite_${chosenInvite}`,
    eyebrow,
    headline: t(`home.greeting.invite.${chosenInvite}`),
    arriving: null,
  };
}

export function selectInvite(
  pool: readonly InvitePhraseId[],
  lastPhraseId: HomePhraseId | null,
  pick: number,
): InvitePhraseId {
  let effectivePool = pool;
  if (lastPhraseId) {
    const filtered = pool.filter((id) => `invite_${id}` !== lastPhraseId);
    if (filtered.length >= 1) {
      effectivePool = filtered;
    }
  }
  const index = Math.min(Math.floor(pick * effectivePool.length), effectivePool.length - 1);
  return effectivePool[index]!;
}


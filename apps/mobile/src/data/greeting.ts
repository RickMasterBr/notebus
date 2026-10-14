/**
 * Decisões puras para a saudação de abertura e prévia do nome (E-08.5 Bloco 15, D-203, D-207, ideia 50).
 * Puro: sem ler o relógio diretamente; a hora vem sempre injetada.
 */
import { t } from "../i18n";

export type GreetingPeriod = "morning" | "afternoon" | "night";

export function greetingPeriod(hour: number): GreetingPeriod {
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 18) return "afternoon";
  return "night";
}

export interface GreetingInput {
  hour: number;
  name: string | null | undefined;
}

export function greetingText({ hour, name }: GreetingInput): string {
  const period = greetingPeriod(hour);
  const greeting = t(`greeting.${period}`);
  const trimmedName = name?.trim();
  if (trimmedName) {
    return t("greeting.with_name", { greeting, name: trimmedName });
  }
  return t("greeting.plain", { greeting });
}

export function greetingEyebrow({ hour, name }: GreetingInput): string {
  const period = greetingPeriod(hour);
  const greeting = t(`greeting.${period}`);
  const trimmedName = name?.trim();
  if (trimmedName) {
    return t("home.greeting.eyebrow_with_name", { greeting, name: trimmedName });
  }
  return t("home.greeting.eyebrow_plain", { greeting });
}

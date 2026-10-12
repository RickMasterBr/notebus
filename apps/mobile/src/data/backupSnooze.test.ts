// E8a, hipótese H1: o "Agora não" é medido no mesmo instante que o cartão usa para decidir.
import { backupReminder, snoozeUntil } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { reminderSnoozeUntil } from "./backupSnooze";

const DAY = 86_400_000;
const P = 1_800_000_000_000;
const due = { lastExportAt: null, recordsUpdatedSinceExport: false, hasRecords: true };

describe("H1: o defeito de hoje", () => {
  it("snoozeUntil(P) com o cartão ainda mostrando P - 30 s: o adiamento é tratado como vencido e o cartão continua", () => {
    const shownAt = P - 30_000;
    expect(backupReminder({ now: shownAt, snoozedUntil: snoozeUntil(P), ...due }).show).toBe(true);
  });
});

describe("H1: reminderSnoozeUntil", () => {
  const press = P;
  const shownAt = P - 30_000;
  const snoozed = reminderSnoozeUntil({ pressAt: press, shownAt });

  it("esconde o cartão que ainda mostra o instante antigo", () => {
    expect(backupReminder({ now: shownAt, snoozedUntil: snoozed, ...due }).show).toBe(false);
  });
  it("esconde até 2 dias depois do instante mostrado, e vence então", () => {
    expect(backupReminder({ now: shownAt + 2 * DAY - 1, snoozedUntil: snoozed, ...due }).show).toBe(false);
    expect(backupReminder({ now: shownAt + 2 * DAY, snoozedUntil: snoozed, ...due }).show).toBe(true);
  });
  it("com o cartão já no instante do toque ou depois, é o mesmo que snoozeUntil(toque)", () => {
    expect(reminderSnoozeUntil({ pressAt: P, shownAt: P })).toBe(snoozeUntil(P));
    expect(reminderSnoozeUntil({ pressAt: P, shownAt: P + 20_000 })).toBe(snoozeUntil(P));
  });
  it("toque antes do instante mostrado (relógio de teste adiantado): usa o toque", () => {
    expect(reminderSnoozeUntil({ pressAt: P - 5_000, shownAt: P })).toBe(snoozeUntil(P - 5_000));
  });
});

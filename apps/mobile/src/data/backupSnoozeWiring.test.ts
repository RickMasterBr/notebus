import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** O texto sem comentários e com espaços normalizados, para comparar trechos exatos. */
const normalized = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ");

export function checkBackupSnoozeWiring(source: string): {
  declaresInstantRef: boolean;
  updatesInstantRef: boolean;
  snoozeUsesShownInstant: boolean;
  snoozeUntilDirect: boolean;
  snoozeAfterConfirmImport: boolean;
} {
  const text = normalized(source);
  const confirmAt = source.indexOf("const confirmImport = useCallback(");
  const snoozeAt = source.indexOf("const snooze =");
  return {
    declaresInstantRef: text.includes("const instantRef = useRef(instant);"),
    updatesInstantRef: text.includes("instantRef.current = instant;"),
    snoozeUsesShownInstant: text.includes(
      "writeSettingNumber(raw, BACKUP_REMINDER_SNOOZED_UNTIL, reminderSnoozeUntil({ pressAt: at, shownAt: instantRef.current }), at,",
    ),
    snoozeUntilDirect: /\bsnoozeUntil\(/.test(text),
    snoozeAfterConfirmImport: confirmAt !== -1 && snoozeAt > confirmAt,
  };
}

describe("backupSnoozeWiring", () => {
  it("BackupProvider mede o Agora não no instante que o cartão mostra", () => {
    const source = readFileSync(join(__dirname, "BackupProvider.tsx"), "utf8");
    expect(checkBackupSnoozeWiring(source)).toEqual({
      declaresInstantRef: true,
      updatesInstantRef: true,
      snoozeUsesShownInstant: true,
      snoozeUntilDirect: false,
      snoozeAfterConfirmImport: true,
    });
  });

  it("o código anterior (snoozeUntil(at), sem instantRef) é reprovado", () => {
    const previous = `
const instant = useNowTick();
const confirmImport = useCallback(() => {}, []);
const snooze = useCallback(() => {
  const at = nowRef.current();
  void exclusive(() => writeSettingNumber(raw, BACKUP_REMINDER_SNOOZED_UNTIL, snoozeUntil(at), at, () => uuidv7(at)));
}, []);`;
    expect(checkBackupSnoozeWiring(previous)).toEqual({
      declaresInstantRef: false,
      updatesInstantRef: false,
      snoozeUsesShownInstant: false,
      snoozeUntilDirect: true,
      snoozeAfterConfirmImport: true,
    });
  });
});

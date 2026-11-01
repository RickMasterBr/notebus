// Só teste: roda no Node, não no app.
// Poda de cópias separada por tipo (ideia 212). Nomes fixos: nada de relógio real (A6).
import { describe, expect, it } from "vitest";
import { BACKUPS_TO_KEEP, type BackupStore, pruneBackups } from "./migrate";

/** Cópias em memória: só registra o nome (a cópia de verdade é a do E-01, provada em `migrate.test.ts`). */
function memoryBackups(names: string[]): BackupStore & { names: string[] } {
  return {
    names,
    create: async (name) => void names.push(name),
    restore: async () => {},
    list: async () => [...names],
    remove: async (name) => void names.splice(names.indexOf(name), 1),
  };
}

/** Cópia de antes de migrar: `notebus-backup-<data>-v<N>.db` (`migrate.ts`). */
const migrationCopy = (n: number) => `notebus-backup-2026-10-0${n}-08-00-00-000Z-v1.db`;
/** Cópia de antes de importar: `notebus-backup-<data>-import.db` (`backup.ts`). */
const importCopy = (n: number) => `notebus-backup-2026-10-0${n}-09-00-00-000Z-import.db`;

describe("poda de cópias por tipo (ideia 212)", () => {
  it("3 de migração + 4 de importação → ficam as 3 de migração e as 3 mais novas de importação", async () => {
    const migration = [migrationCopy(1), migrationCopy(2), migrationCopy(3)];
    const imports = [importCopy(1), importCopy(2), importCopy(3), importCopy(4)];
    const backups = memoryBackups([...migration, ...imports]);

    await pruneBackups(backups);

    expect(backups.names).toEqual([...migration, importCopy(2), importCopy(3), importCopy(4)]);
  });

  it("uma importação não apaga cópia de migração (3 de migração + 1 de importação ficam todas)", async () => {
    const names = [migrationCopy(1), migrationCopy(2), migrationCopy(3), importCopy(1)];
    const backups = memoryBackups([...names]);

    await pruneBackups(backups);

    expect(backups.names).toEqual(names);
  });

  it("uma migração não apaga cópia de importação (3 de importação + 1 de migração ficam todas)", async () => {
    const names = [importCopy(1), importCopy(2), importCopy(3), migrationCopy(1)];
    const backups = memoryBackups([...names]);

    await pruneBackups(backups);

    expect(backups.names).toEqual(names);
  });

  it("a ordem por nome continua valendo dentro de cada tipo, mesmo com a lista fora de ordem", async () => {
    const backups = memoryBackups([
      importCopy(4), migrationCopy(1), importCopy(1), migrationCopy(4),
      importCopy(2), migrationCopy(2), importCopy(3), migrationCopy(3),
    ]);

    await pruneBackups(backups);

    expect([...backups.names].sort()).toEqual(
      [migrationCopy(2), migrationCopy(3), migrationCopy(4), importCopy(2), importCopy(3), importCopy(4)].sort(),
    );
  });

  it("BACKUPS_TO_KEEP continua 3 e arquivo sem o prefixo não é podado", async () => {
    expect(BACKUPS_TO_KEEP).toBe(3);
    const other = ["notebus.db", "copia-do-usuario.db"];
    const backups = memoryBackups([...other, importCopy(1), importCopy(2), importCopy(3), importCopy(4)]);

    await pruneBackups(backups);

    expect(backups.names).toEqual([...other, importCopy(2), importCopy(3), importCopy(4)]);
  });
});

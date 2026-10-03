/** Utilitários para rodar migrações seguras no banco de dados SQLite. */
/**
 * Migração protegida (E-01 §6, primeira camada da D-082). Sem expo-sqlite aqui: o celular e os testes
 * no Node usam este mesmo código, cada um com o seu adaptador (`open.ts` e `testing/nodeSqlite.ts`).
 *
 * 1. Há migração pendente → copia o banco para um arquivo com data.
 * 2. Aplica todas as pendentes numa transação só.
 * 3. Falhou → desfaz, restaura a cópia, deixa o banco só-leitura nesta sessão e devolve `MigrationFailedError`.
 * 4. Guarda as 3 últimas cópias; apaga as mais velhas.
 *
 * A versão do banco é o `PRAGMA user_version` (= quantas migrações já rodaram). Ele fica no cabeçalho
 * do arquivo e entra na transação: ou sobe junto com as migrações, ou não sobe.
 */

export interface Migration {
  tag: string;
  /** SQL do drizzle-kit; comandos separados por `--> statement-breakpoint`. Só mudanças aditivas (§6.5). */
  sql: string;
}

/** O mínimo que a migração precisa do banco aberto. */
export interface MigrationDb {
  exec(sql: string): Promise<void>;
  userVersion(): Promise<number>;
}

/** Onde ficam as cópias do banco. */
export interface BackupStore {
  /** Copia o banco inteiro para um arquivo com este nome. */
  create(name: string): Promise<void>;
  /** Devolve o banco ao conteúdo exato da cópia. */
  restore(name: string): Promise<void>;
  list(): Promise<string[]>;
  remove(name: string): Promise<void>;
}

export const BACKUPS_TO_KEEP = 3;
const BACKUP_PREFIX = "notebus-backup-";

/** O que a tela mostra como "Não foi possível atualizar os dados; nada foi perdido". */
/**
 * Erro lançado quando a migração falha no meio e o banco de dados volta ao estado anterior.
 * Fica para a tela mostrar ao usuário "Não foi possível atualizar os dados; nada foi perdido".
 */
export class MigrationFailedError extends Error {
  readonly code = "migration_failed";
  constructor(
    readonly fromVersion: number,
    readonly targetVersion: number,
    /** Cópia feita antes de migrar; `null` se a falha foi ao copiar (nada foi tocado). */
    readonly backupName: string | null,
    /** `false` só se até a restauração falhou; a transação já tinha sido desfeita. */
    readonly restored: boolean,
    readonly cause: unknown,
  ) {
    super(`migração ${fromVersion} → ${targetVersion} falhou: ${String(cause)}`);
    this.name = "MigrationFailedError";
  }
}

export type MigrationResult =
  | { status: "up_to_date"; version: number }
  | { status: "migrated"; from: number; to: number; backupName: string }
  | { status: "failed"; error: MigrationFailedError };

export async function migrateProtected(opts: {
  db: MigrationDb;
  backups: BackupStore;
  migrations: readonly Migration[];
  now?: () => number;
}): Promise<MigrationResult> {
  const { db, backups, migrations } = opts;
  const now = opts.now ?? Date.now;
  const from = await db.userVersion();
  const to = migrations.length;
  // Banco de um build mais novo (from > to): segue sem migrar; as migrações são só aditivas.
  if (from >= to) return { status: "up_to_date", version: from };

  const backupName = `${BACKUP_PREFIX}${new Date(now()).toISOString().replace(/[:.]/g, "-")}-v${from}.db`;
  try {
    await backups.create(backupName);
  } catch (cause) {
    await db.exec("PRAGMA query_only = ON");
    return { status: "failed", error: new MigrationFailedError(from, to, null, true, cause) };
  }

  try {
    await db.exec("BEGIN IMMEDIATE");
    for (const m of migrations.slice(from)) {
      for (const stmt of m.sql.split("--> statement-breakpoint")) {
        if (stmt.trim()) await db.exec(stmt);
      }
    }
    await db.exec(`PRAGMA user_version = ${to}`);
    await db.exec("COMMIT");
  } catch (cause) {
    await db.exec("ROLLBACK").catch(() => {});
    let restored = true;
    try {
      await backups.restore(backupName);
    } catch {
      restored = false;
    }
    // "Sem gravar nada novo até o próximo build" (§6.3): o SQLite recusa qualquer escrita nesta conexão.
    await db.exec("PRAGMA query_only = ON");
    await pruneBackups(backups);
    return { status: "failed", error: new MigrationFailedError(from, to, backupName, restored, cause) };
  }

  await pruneBackups(backups);
  return { status: "migrated", from, to, backupName };
}

/** Mantém as `BACKUPS_TO_KEEP` cópias mais novas (o nome começa pela data, então ordem de nome = ordem de tempo). */
export async function pruneBackups(backups: BackupStore): Promise<void> {
  const ours = (await backups.list()).filter((n) => n.startsWith(BACKUP_PREFIX)).sort();
  for (const name of ours.slice(0, Math.max(0, ours.length - BACKUPS_TO_KEEP))) {
    await backups.remove(name);
  }
}

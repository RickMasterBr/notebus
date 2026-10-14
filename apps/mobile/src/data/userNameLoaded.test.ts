/// <reference types="node" />
/**
 * Testes do indicador loaded no UserNameProvider (E-08.5 Bloco 17, Item 4.1).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { writeUserName } from "../db/userName";
import {
  USER_NAME_CONTEXT_DEFAULT,
  loadUserNameState,
} from "./UserNameProvider";

describe("UserNameProvider: indicador loaded (Item 4.1, D-207)", () => {
  it("o valor padrão do contexto tem loaded: true", () => {
    expect(USER_NAME_CONTEXT_DEFAULT.loaded).toBe(true);
    expect(USER_NAME_CONTEXT_DEFAULT.name).toBeNull();
  });

  it("false antes da leitura e true depois com sucesso", async () => {
    const { db } = testDbWithSqlite();
    await writeUserName(db, "Richard", 1_700_000_000_000);

    let loaded = false;
    let name: string | null = null;

    // Antes da leitura
    expect(loaded).toBe(false);

    // Leitura conclui
    await loadUserNameState(
      db,
      (val) => {
        name = val;
      },
      () => {
        loaded = true;
      },
    );

    // Depois da leitura
    expect(loaded).toBe(true);
    expect(name).toBe("Richard");
  });

  it("true mesmo quando a leitura lança erro", async () => {
    const failingDb = {
      select() {
        throw new Error("Falha intencional de leitura do banco");
      },
    } as any;

    let loaded = false;
    let name: string | null = "inicial";

    // Antes da leitura
    expect(loaded).toBe(false);

    // Leitura lança, mas não propaga exceção e marca loaded como true
    await loadUserNameState(
      failingDb,
      (val) => {
        name = val;
      },
      () => {
        loaded = true;
      },
    );

    expect(loaded).toBe(true);
    // name não foi alterado devido ao erro capturado
    expect(name).toBe("inicial");
  });

  it("guarda estático de ligação do UserNameProvider: loaded inicial false, setLoaded(true) no refresh e repassado no useMemo", () => {
    const source = readFileSync(join(__dirname, "UserNameProvider.tsx"), "utf8");
    expect(source).toMatch(/loaded:\s*boolean/);
    expect(source).toMatch(/loaded:\s*true/);
    expect(source).toMatch(/useState\s*\(\s*false\s*\)/);
    expect(source).toMatch(/setLoaded\(\s*true\s*\)/);
    expect(source).toMatch(/value\s*=\s*useMemo\(\s*\(\)\s*=>\s*\(\{[\s\S]*?loaded[\s\S]*?\}\),\s*\[[^\]]*?loaded/);
  });
});

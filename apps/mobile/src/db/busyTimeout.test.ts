/// <reference types="node" />
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";

// `open.ts` importa o expo-sqlite, que só existe no aparelho; aqui valem a função pura e o texto do arquivo.
// O `drizzle-orm/expo-sqlite` (externo, carregado direto pelo Node) também importa o expo-sqlite: trocado pelo falso.
vi.mock("expo-sqlite", () => ({}));
vi.mock("drizzle-orm/expo-sqlite", () => ({ drizzle: vi.fn() }));

type OpenModule = typeof import("./open");
let open: OpenModule;

beforeAll(async () => {
  open = await import("./open");
});

const strip = (url: URL) =>
  readFileSync(url, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\/|(^|[\s;{(,])\/\/.*$/gm, "$1");

describe("banco do app · espera por banco ocupado (ideia 209)", () => {
  it("(a) BUSY_TIMEOUT_MS é 5000 e setBusyTimeout emite exatamente PRAGMA busy_timeout = 5000", async () => {
    expect(open.BUSY_TIMEOUT_MS).toBe(5000);
    const emitted: string[] = [];
    await open.setBusyTimeout({
      execAsync: async (sql) => {
        emitted.push(sql);
      },
    });
    expect(emitted).toEqual(["PRAGMA busy_timeout = 5000"]);
  });

  it("(b) setBusyTimeout propaga o erro do execAsync", async () => {
    const failing = {
      execAsync: async () => {
        throw new Error("database is locked");
      },
    };
    await expect(open.setBusyTimeout(failing)).rejects.toThrow("database is locked");
  });

  it("(c) em open.ts, openNotebusDb chama setBusyTimeout antes de migrateProtected", () => {
    const text = strip(new URL("./open.ts", import.meta.url));
    const start = text.indexOf("export async function openNotebusDb");
    const end = text.indexOf("export function expoImportDb");
    expect(start, "openNotebusDb").toBeGreaterThanOrEqual(0);
    expect(end, "expoImportDb depois de openNotebusDb").toBeGreaterThan(start);

    const body = text.slice(start, end);
    const callIdx = body.indexOf("setBusyTimeout(");
    const migrateIdx = body.indexOf("migrateProtected(");
    expect(callIdx, "setBusyTimeout em openNotebusDb").toBeGreaterThanOrEqual(0);
    expect(migrateIdx, "migrateProtected em openNotebusDb").toBeGreaterThanOrEqual(0);
    expect(callIdx, "setBusyTimeout antes de migrateProtected").toBeLessThan(migrateIdx);
  });

  it("(d) em open.ts, openExistingNotebusDb chama a mesma função e não repete o texto solto", () => {
    const text = strip(new URL("./open.ts", import.meta.url));
    const start = text.indexOf("export async function openExistingNotebusDb");
    expect(start, "openExistingNotebusDb").toBeGreaterThanOrEqual(0);

    const body = text.slice(start);
    expect(body).toContain("setBusyTimeout(sqlite)");
    expect(body).not.toContain("PRAGMA busy_timeout = 5000");
  });
});

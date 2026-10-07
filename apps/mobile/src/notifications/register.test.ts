import { describe, expect, it, vi } from "vitest";

vi.mock("../db/open", () => ({
  openExistingNotebusDb: vi.fn(),
}));

vi.mock("./expoPort", () => ({
  expoPort: {
    showInForeground: vi.fn(),
    setCategories: vi.fn().mockResolvedValue(undefined),
    onResponse: vi.fn(),
    getLastResponse: vi.fn().mockResolvedValue(null),
  },
}));

import { createGetDb } from "./register";

describe("0a: getDb no despertar em segundo plano", () => {
  it("com um openExisting falso que devolve null e depois um banco, a segunda chamada devolve o banco", async () => {
    let calls = 0;
    const fakeDb = { tag: "fakeDb" } as any;
    const openExisting = async () => {
      calls++;
      return calls === 1 ? null : fakeDb;
    };
    const getDb = createGetDb(openExisting, () => null);

    const first = await getDb();
    expect(first).toBeNull();

    const second = await getDb();
    expect(second).toBe(fakeDb);
  });
});

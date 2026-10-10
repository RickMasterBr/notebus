import { describe, expect, it } from "vitest";
import { createSubmitGuard } from "./submitGuard";

describe("createSubmitGuard", () => {
  it("segunda chamada durante a primeira é ignorada", async () => {
    const guard = createSubmitGuard();
    let runs = 0;
    let resolveFirst!: () => void;
    const firstPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const call1 = guard.run(async () => {
      runs++;
      await firstPromise;
      return "res1";
    });

    // Segunda chamada enquanto a primeira está em andamento
    const call2 = guard.run(async () => {
      runs++;
      return "res2";
    });

    expect(guard.isRunning).toBe(true);
    resolveFirst();
    const [res1, res2] = await Promise.all([call1, call2]);

    expect(res1).toBe("res1");
    expect(res2).toBeUndefined();
    expect(runs).toBe(1);
    expect(guard.isRunning).toBe(false);
  });

  it("depois de terminar volta a funcionar", async () => {
    const guard = createSubmitGuard();
    let runs = 0;

    await guard.run(async () => {
      runs++;
    });
    expect(runs).toBe(1);
    expect(guard.isRunning).toBe(false);

    await guard.run(async () => {
      runs++;
    });
    expect(runs).toBe(2);
    expect(guard.isRunning).toBe(false);
  });

  it("depois de erro volta a funcionar", async () => {
    const guard = createSubmitGuard();
    let runs = 0;

    await expect(
      guard.run(async () => {
        runs++;
        throw new Error("falha de teste");
      }),
    ).rejects.toThrow("falha de teste");

    expect(runs).toBe(1);
    expect(guard.isRunning).toBe(false);

    await guard.run(async () => {
      runs++;
    });
    expect(runs).toBe(2);
    expect(guard.isRunning).toBe(false);
  });
});

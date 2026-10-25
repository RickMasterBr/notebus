import { describe, it, expect } from "vitest";
import config from "../vitest.config";

describe("vitest.config do app", () => {
  it("K2 testTimeout e maxWorkers tem os valores do gate", () => {
    expect(config.test?.testTimeout).toBe(20000);
    expect(config.test?.maxWorkers).toBe(2);
  });

  it("K2 test tem so as duas chaves", () => {
    expect(Object.keys(config.test ?? {}).sort()).toEqual(["maxWorkers", "testTimeout"]);
  });

  it("K2 config tem so a chave test", () => {
    expect(Object.keys(config)).toEqual(["test"]);
  });
});

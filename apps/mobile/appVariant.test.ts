import { readFileSync } from "node:fs";
import type { ExpoConfig } from "expo/config";
import { describe, expect, it } from "vitest";
import { DEV_BUNDLE_ID, DEV_NAME, applyVariant, parseVariant } from "./appVariant";

const appJson = JSON.parse(readFileSync(new URL("./app.json", import.meta.url), "utf8")) as { expo: ExpoConfig };
const base = appJson.expo;

describe("variante do build", () => {
  it("normal devolve exatamente o app.json de hoje", () => {
    expect(applyVariant(structuredClone(base), "normal")).toEqual(base);
  });

  it("o app.json segue com o nome e o identificador do app normal", () => {
    expect(base.name).toBe("NoteBus");
    expect(base.ios?.bundleIdentifier).toBe("com.rickmasterbr.notebus");
  });

  it("dev muda só o nome e o bundleIdentifier do iOS", () => {
    const dev = applyVariant(structuredClone(base), "dev");
    expect(dev.name).toBe(DEV_NAME);
    expect(dev.ios?.bundleIdentifier).toBe(DEV_BUNDLE_ID);
    expect(DEV_BUNDLE_ID).toBe("com.rickmasterbr.notebus.dev");
    expect(DEV_NAME).toBe("NoteBus Dev");
    const expected = structuredClone(base);
    expected.name = DEV_NAME;
    expected.ios = { ...expected.ios, bundleIdentifier: DEV_BUNDLE_ID };
    expect(dev).toEqual(expected);
  });

  it("não altera o objeto original", () => {
    const copy = structuredClone(base);
    applyVariant(copy, "dev");
    expect(copy).toEqual(base);
  });

  it("só 'dev' liga a variante dev", () => {
    expect(parseVariant("dev")).toBe("dev");
    for (const v of [undefined, "", "normal", "DEV", "desenvolvimento"]) expect(parseVariant(v)).toBe("normal");
  });
});

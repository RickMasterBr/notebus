import { describe, expect, it } from "vitest";
import { resolveSettingsScroll } from "./settingsScroll";

describe("resolveSettingsScroll (FN-18)", () => {
  it("ao sair de root para uma página, guarda o deslocamento da lista", () => {
    const res = resolveSettingsScroll("root", "about", 185);
    expect(res).toEqual({ saveOffset: 185, restoreOffset: null });
  });

  it("ao voltar para root, restaura exatamente esse valor (sem animação)", () => {
    const res = resolveSettingsScroll("about", "root", 185);
    expect(res).toEqual({ saveOffset: 185, restoreOffset: 185 });
  });

  it("de uma página para outra página não restaura nada", () => {
    const res = resolveSettingsScroll("about", "backup", 185);
    expect(res).toEqual({ saveOffset: 185, restoreOffset: null });
  });

  it("ao fechar a folha o valor guardado zera", () => {
    const res1 = resolveSettingsScroll("root", "closed", 185);
    expect(res1).toEqual({ saveOffset: 0, restoreOffset: null });

    const res2 = resolveSettingsScroll("about", null, 185);
    expect(res2).toEqual({ saveOffset: 0, restoreOffset: null });
  });
});

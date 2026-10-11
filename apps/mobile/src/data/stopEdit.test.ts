import { describe, expect, it } from "vitest";
import {
  addAlias,
  normalizeAlias,
  stopEditView,
  stopLocationStatusKey,
  validateStopEdit,
} from "./stopEdit";

describe("stopEdit (Item 1: regras puras do formulário)", () => {
  describe("normalizeAlias", () => {
    it("faz trim e reduz múltiplos espaços internos a um só", () => {
      expect(normalizeAlias("   shopping   leiria   ")).toBe("shopping leiria");
      expect(normalizeAlias(" centro   comercial ")).toBe("centro comercial");
    });

    it("espaço vazio ou só espaços devolve null", () => {
      expect(normalizeAlias("")).toBeNull();
      expect(normalizeAlias("   ")).toBeNull();
      expect(normalizeAlias("\t \n ")).toBeNull();
    });
  });

  describe("addAlias", () => {
    const current = ["Shopping", "ESTG"];
    const name = "R. Quinta do Seminário";

    it("adiciona apelido válido normalizado", () => {
      const res = addAlias(current, "  Centro  Comercial  ", name);
      expect(res).toEqual({
        ok: true,
        aliases: ["Shopping", "ESTG", "Centro Comercial"],
      });
    });

    it("recusa apelido vazio (empty)", () => {
      expect(addAlias(current, "   ", name)).toEqual({ ok: false, reason: "empty" });
      expect(addAlias(current, "", name)).toEqual({ ok: false, reason: "empty" });
    });

    it("recusa apelido igual ao nome (same_as_name), insensível a acento e caixa", () => {
      expect(addAlias(current, "r. quinta do seminario", name)).toEqual({
        ok: false,
        reason: "same_as_name",
      });
      expect(addAlias(current, "R. QUINTA DO SEMINÁRIO", name)).toEqual({
        ok: false,
        reason: "same_as_name",
      });
    });

    it("recusa apelido duplicado (duplicate), 'Shopping' x 'shoppíng'", () => {
      expect(addAlias(current, "shopping", name)).toEqual({
        ok: false,
        reason: "duplicate",
      });
      expect(addAlias(current, "shoppíng", name)).toEqual({
        ok: false,
        reason: "duplicate",
      });
      expect(addAlias(current, "SHOPPING", name)).toEqual({
        ok: false,
        reason: "duplicate",
      });
    });

    it("recusa apelido com mais de 60 caracteres (too_long)", () => {
      const long = "a".repeat(61);
      expect(addAlias(current, long, name)).toEqual({ ok: false, reason: "too_long" });
      const exactly60 = "a".repeat(60);
      expect(addAlias(current, exactly60, name).ok).toBe(true);
    });

    it("recusa 11º apelido quando já há 10 (too_many)", () => {
      const ten = Array.from({ length: 10 }, (_, i) => `Apelido ${i + 1}`);
      expect(addAlias(ten, "Novo", name)).toEqual({ ok: false, reason: "too_many" });
      const nine = Array.from({ length: 9 }, (_, i) => `Apelido ${i + 1}`);
      expect(addAlias(nine, "Novo", name).ok).toBe(true);
    });
  });

  describe("validateStopEdit", () => {
    const others = [
      { id: "s1", name: "Estação", externalId: "1001" },
      { id: "s2", name: "Campus", externalId: "2002" },
      { id: "s3", name: "Parada Sem ID", externalId: null },
      { id: "s4", name: "Outra Sem ID", externalId: null },
    ];

    it("valida e normaliza campos válidos", () => {
      const res = validateStopEdit({
        name: "  Rotunda Nova  ",
        externalId: "  3003  ",
        note: "  Perto da rotunda  ",
        aliases: ["Rotunda"],
        others,
      });
      expect(res).toEqual({
        ok: true,
        value: {
          name: "Rotunda Nova",
          externalId: "3003",
          note: "Perto da rotunda",
          aliases: ["Rotunda"],
        },
      });
    });

    it("externalId vazio vira null e note vazia vira null", () => {
      const res = validateStopEdit({
        name: "Praça",
        externalId: "   ",
        note: "",
        aliases: [],
        others,
      });
      expect(res).toEqual({
        ok: true,
        value: {
          name: "Praça",
          externalId: null,
          note: null,
          aliases: [],
        },
      });
    });

    it("recusa nome vazio ou só espaços (required)", () => {
      const res = validateStopEdit({
        name: "   ",
        externalId: null,
        note: null,
        aliases: [],
        others,
      });
      expect(res).toEqual({
        ok: false,
        errors: { name: "required" },
      });
    });

    it("recusa nome longo demais > 80 caracteres (too_long)", () => {
      const res = validateStopEdit({
        name: "N".repeat(81),
        externalId: null,
        note: null,
        aliases: [],
        others,
      });
      expect(res).toEqual({
        ok: false,
        errors: { name: "too_long" },
      });
    });

    it("recusa nota longa demais > 200 caracteres (too_long)", () => {
      const res = validateStopEdit({
        name: "Ponto",
        externalId: null,
        note: "X".repeat(201),
        aliases: [],
        others,
      });
      expect(res).toEqual({
        ok: false,
        errors: { note: "too_long" },
      });
    });

    it("recusa externalId repetido apontando o nome certo do outro ponto", () => {
      const res = validateStopEdit({
        name: "Meu Ponto",
        externalId: "1001",
        note: null,
        aliases: [],
        others,
      });
      expect(res).toEqual({
        ok: false,
        errors: { externalId: { duplicateOf: "Estação" } },
      });
    });

    it("externalId repetido compara sem diferenciar maiúsculas e com trim", () => {
      const res = validateStopEdit({
        name: "Meu Ponto",
        externalId: "  campus  ", // others tem "Campus" com externalId "2002", mas e se outro tiver "ABC"?
        note: null,
        aliases: [],
        others: [{ id: "s5", name: "Ponto Letras", externalId: "ABC" }],
      });
      const resDuplicate = validateStopEdit({
        name: "Meu Ponto",
        externalId: "  abc  ",
        note: null,
        aliases: [],
        others: [{ id: "s5", name: "Ponto Letras", externalId: "ABC" }],
      });
      expect(resDuplicate).toEqual({
        ok: false,
        errors: { externalId: { duplicateOf: "Ponto Letras" } },
      });
    });

    it("vários pontos com externalId null não são repetição", () => {
      const res = validateStopEdit({
        name: "Novo Ponto",
        externalId: null,
        note: null,
        aliases: [],
        others,
      });
      expect(res.ok).toBe(true);
    });

    it("ID do próprio ponto não está em others, logo não é repetição", () => {
      // others já exclui o ponto em edição
      const res = validateStopEdit({
        name: "Estação",
        externalId: "1001",
        note: null,
        aliases: [],
        others: [{ id: "s2", name: "Campus", externalId: "2002" }],
      });
      expect(res.ok).toBe(true);
    });
  });

  describe("stopEditView", () => {
    const original = {
      name: "Rua Exemplo",
      externalId: "1001",
      note: "Nota antiga",
      aliases: ["Exemplo"],
    };

    it("canSave falso sem mudança", () => {
      const draft = { ...original };
      const validation = validateStopEdit({ ...draft, others: [] });
      const view = stopEditView({ original, draft, validation });
      expect(view.isChanged).toBe(false);
      expect(view.canSave).toBe(false);
      expect(view.nameError).toBeNull();
      expect(view.externalIdError).toBeNull();
      expect(view.noteError).toBeNull();
      expect(view.aliasError).toBeNull();
    });

    it("espaço no fim do nome não conta como mudança após normalizar", () => {
      const draft = { ...original, name: "Rua Exemplo   " };
      const validation = validateStopEdit({ ...draft, others: [] });
      const view = stopEditView({ original, draft, validation });
      expect(view.isChanged).toBe(false);
      expect(view.canSave).toBe(false);
    });

    it("canSave falso com mudança mas nome inválido", () => {
      const draft = { ...original, name: "" };
      const validation = validateStopEdit({ ...draft, others: [] });
      const view = stopEditView({ original, draft, validation });
      expect(view.isChanged).toBe(true);
      expect(view.canSave).toBe(false);
      expect(view.nameError).toBe("required");
    });

    it("canSave verdadeiro com só um apelido novo", () => {
      const draft = { ...original, aliases: ["Exemplo", "Novo Apelido"] };
      const validation = validateStopEdit({ ...draft, others: [] });
      const view = stopEditView({ original, draft, validation });
      expect(view.isChanged).toBe(true);
      expect(view.canSave).toBe(true);
    });

    it("canSave verdadeiro com nome alterado válido", () => {
      const draft = { ...original, name: "Rua Alterada" };
      const validation = validateStopEdit({ ...draft, others: [] });
      const view = stopEditView({ original, draft, validation });
      expect(view.isChanged).toBe(true);
      expect(view.canSave).toBe(true);
    });

    it("repassa aliasError quando fornecido", () => {
      const draft = { ...original };
      const validation = validateStopEdit({ ...draft, others: [] });
      const view = stopEditView({ original, draft, validation, aliasError: "duplicate" });
      expect(view.aliasError).toBe("duplicate");
    });
  });

  describe("stopLocationStatusKey", () => {
    it("devolve stop_edit.location.none quando lat ou lon é null", () => {
      expect(stopLocationStatusKey(null, null, null)).toBe("stop_edit.location.none");
      expect(stopLocationStatusKey(39.74, null, "manual")).toBe("stop_edit.location.none");
      expect(stopLocationStatusKey(null, -8.8, "suggested")).toBe("stop_edit.location.none");
    });

    it("devolve stop_edit.location.manual quando manual", () => {
      expect(stopLocationStatusKey(39.74, -8.8, "manual")).toBe("stop_edit.location.manual");
    });

    it("devolve stop_edit.location.suggested quando suggested", () => {
      expect(stopLocationStatusKey(39.74, -8.8, "suggested")).toBe("stop_edit.location.suggested");
    });

    it("devolve stop_edit.location.official quando lat e lon presentes e source null", () => {
      expect(stopLocationStatusKey(39.74, -8.8, null)).toBe("stop_edit.location.official");
    });
  });
});

